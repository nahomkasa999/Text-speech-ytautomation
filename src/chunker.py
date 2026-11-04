"""
Smart Text Chunker for Long-form Audiobooks
Handles 12,000 - 20,000+ words smoothly by breaking text into
natural sentences and paragraphs without cutting mid-thought.
"""

import re
from typing import List, Dict, Any

def strip_markdown(text: str) -> str:
    """
    Strips Markdown syntax (headers #, bold/italics *, links, backticks, bullet dashes)
    so the AI voice does not speak symbols like 'hashtag' or 'asterisk'.
    """
    # Remove markdown image syntax: ![alt](url) -> alt
    text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)
    # Remove markdown hyperlinks: [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Remove header hashes: # Chapter 1 or ### The Call -> Chapter 1 / The Call
    text = re.sub(r'^[ \t]*#{1,6}[ \t]+', '', text, flags=re.MULTILINE)
    # Remove horizontal divider lines: --- or *** or ___
    text = re.sub(r'^[ \t]*[-*_]{3,}[ \t]*$', '', text, flags=re.MULTILINE)
    # Remove blockquotes: > Quote -> Quote
    text = re.sub(r'^[ \t]*>[ \t]*', '', text, flags=re.MULTILINE)
    # Remove bullet markers: - Point or * Point -> Point
    text = re.sub(r'^[ \t]*[-*+][ \t]+', '', text, flags=re.MULTILINE)
    # Remove bold & italics: ***bold italic***, **bold**, *italic*
    text = re.sub(r'\*\*\*([^\*]+)\*\*\*', r'\1', text)
    text = re.sub(r'\*\*([^\*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^\*]+)\*', r'\1', text)
    text = re.sub(r'___([^_]+)___', r'\1', text)
    text = re.sub(r'__([^_]+)__', r'\1', text)
    text = re.sub(r'_([^_]+)_', r'\1', text)
    # Remove strikethrough: ~~text~~ -> text
    text = re.sub(r'~~([^~]+)~~', r'\1', text)
    # Remove code blocks: ```code``` -> code
    text = re.sub(r'```[a-zA-Z0-9]*\n([\s\S]*?)\n```', r'\1', text)
    # Remove inline code: `code` -> code
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return text

def clean_text(text: str) -> str:
    """Normalize markdown, quotes, dashes, and whitespace for clean TTS pronunciation."""
    text = strip_markdown(text)
    text = text.strip()
    # Normalize fancy quotes and dashes
    text = re.sub(r'["""]', '"', text)
    text = re.sub(r"[''']", "'", text)
    text = re.sub(r"[—–]", " - ", text)
    # Remove multiple spaces
    text = re.sub(r'[ \t]+', ' ', text)
    return text

def split_into_sentences(text: str) -> List[str]:
    """Split paragraph into clean sentences using regex punctuation boundaries."""
    # Split by sentence-ending punctuation followed by space or end of string
    sentence_end = re.compile(r'(?<=[.!?…])\s+(?=[A-Z0-9"\'\(\[])')
    parts = sentence_end.split(text)
    
    sentences = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # If part is still too long (> 350 chars), split on clauses / commas / semicolons
        if len(part) > 350:
            sub_clauses = re.split(r'(?<=[,;:])\s+', part)
            buffer = ""
            for clause in sub_clauses:
                if len(buffer) + len(clause) + 1 <= 350:
                    buffer = f"{buffer} {clause}".strip()
                else:
                    if buffer:
                        sentences.append(buffer)
                    buffer = clause
            if buffer:
                sentences.append(buffer)
        else:
            sentences.append(part)
            
    return sentences

def chunk_text_for_narration(text: str, max_chunk_chars: int = 400) -> List[Dict[str, Any]]:
    """
    Splits long book text into an ordered list of speakable sentence chunks.
    Each chunk records:
      - text: the text to speak
      - is_paragraph_end: whether it's the end of a paragraph (for longer natural pause)
      - index: order index
    """
    cleaned = clean_text(text)
    if not cleaned:
        return []

    # Split by paragraphs (one or more newlines)
    raw_paragraphs = re.split(r'\n\s*\n+', cleaned)
    chunks = []
    chunk_idx = 0

    for p_idx, para in enumerate(raw_paragraphs):
        para = para.strip().replace('\n', ' ')
        if not para:
            continue
            
        sentences = split_into_sentences(para)
        if not sentences:
            continue

        for s_idx, sentence in enumerate(sentences):
            sentence = sentence.strip()
            if not sentence:
                continue
            is_last_in_para = (s_idx == len(sentences) - 1)
            chunks.append({
                "id": chunk_idx,
                "text": sentence,
                "is_paragraph_end": is_last_in_para
            })
            chunk_idx += 1

    return chunks
