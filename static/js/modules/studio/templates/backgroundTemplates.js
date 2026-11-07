/**
 * Studio Background Templates and Cover Image Uploader.
 */

import { uploadImageApi, updateSessionApi } from '../../services/api.js';
import { showToast } from '../../ui/toast.js';

export class BackgroundManager {
  constructor({ el, state, callbacks }) {
    this.el = el;
    this.state = state;
    this.callbacks = callbacks;
    this.bgLoadToken = 0;

    this.attachEvents();
  }

  loadTemplate(url, shouldSave = true) {
    if (!url) return;
    const token = ++this.bgLoadToken;
    this.state.video.bgImageUrl = url;
    const img = new Image();

    img.onload = () => {
      if (token !== this.bgLoadToken) return;
      this.state.video.bgImage = img;
      this.state.video.bgImageUrl = url;
      this.state.video.bgImageLoaded = true;
      this.callbacks.renderVideoFrame();

      if (shouldSave) {
        try { localStorage.setItem('book_narrator_bg_image', url); } catch (e) {}
        this.saveBgForActiveSession(url);
        this.callbacks.debouncedSaveDraft();
      }
    };
    img.onerror = () => {
      console.warn('Could not load background template:', url);
    };
    img.src = url;
  }

  async saveBgForActiveSession(url) {
    const sess = this.state.activeSession;
    if (!sess || !url || url.startsWith('data:') || sess.bg_image === url) return;
    sess.bg_image = url;
    const listed = this.state.sessions.find(s => s.id === sess.id);
    if (listed) listed.bg_image = url;
    try {
      await updateSessionApi(sess.id, { bg_image: url });
    } catch (e) {
      console.warn('Could not save background for session:', e);
    }
  }

  attachEvents() {
    // The sample-template button may not exist in the current layout; guard so
    // a missing element doesn't abort the whole app start-up.
    this.el.btnSampleTemplate?.addEventListener('click', () => {
      this.loadTemplate('/templates/sample-book.jpg', true);
      showToast('Loaded sample book mockup', 'info');
    });

    this.el.bgImageUploader?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showToast('Applying cover image...', 'info');

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;
        this.loadTemplate(dataUrl, false);
        try {
          const data = await uploadImageApi(dataUrl);
          if (data && data.url) {
            this.loadTemplate(data.url, false);
            try { localStorage.setItem('book_narrator_bg_image', data.url); } catch (err) {}
            this.saveBgForActiveSession(data.url);
            this.callbacks.saveDraft?.();
            showToast('Cover image saved & persisted', 'success');
          }
        } catch (err) {
          console.warn('Could not persist image to server:', err);
        }
      };
      reader.readAsDataURL(file);
    });
  }
}
