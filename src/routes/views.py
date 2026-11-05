"""
Views Router: Composes modular HTML partials into the main application page.
"""

import os
from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from src.config import STATIC_DIR

router = APIRouter()

def read_partial(name: str) -> str:
    path = os.path.join(STATIC_DIR, "partials", name)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

@router.get("/", response_class=HTMLResponse)
def index_view():
    left_sidebar = read_partial("leftSidebar.html")
    narrator_view = read_partial("narratorView.html")
    studio_topbar = read_partial("studioTopBar.html")
    studio_stage = read_partial("studioStage.html")
    studio_timeline = read_partial("studioTimeline.html")
    right_sidebar_voice = read_partial("rightSidebarVoice.html")
    right_sidebar_studio = read_partial("rightSidebarStudio.html")
    zen_toolbar = read_partial("zenToolbar.html")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Book Narrator & YouTube Automation Studio</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/video-studio.css">
  <script src="/vendor/lucide.min.js"></script>
</head>
<body>
  <div class="app-container">
    {left_sidebar}

    <main class="center-workspace">
      {narrator_view}

      <div id="video-studio-view" class="view-panel hidden">
        {studio_topbar}
        {studio_stage}
        {studio_timeline}
      </div>
    </main>

    <aside id="right-sidebar" class="sidebar right-sidebar">
      {right_sidebar_voice}
      {right_sidebar_studio}
    </aside>
  </div>

  {zen_toolbar}

  <audio id="preview-audio-player" style="display: none;"></audio>
  <audio id="video-audio-player" style="display: none;"></audio>
  <script type="module" src="/js/app.js"></script>
</body>
</html>"""
    return HTMLResponse(content=html)
