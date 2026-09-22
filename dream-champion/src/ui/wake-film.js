// Loss-only film: mobile autoplay recovery, explicit controls, retained final frame.
// The shipped wake.mp4 is the Higgsfield take ffe074a6-6760-4d72-ab49-5f5bb84cb2b1.
export function showWakeFilm(parent, url, { muted = false, onVisible = () => {} } = {}) {
  const layer = document.createElement('div'); layer.className = 'wake-film';
  const video = document.createElement('video');
  video.src = url; video.playsInline = true; video.setAttribute('playsinline', '');
  video.preload = 'auto'; video.muted = muted;
  const play = document.createElement('button'); play.className = 'wake-film-play';
  play.textContent = 'Tap to play wake-up scene'; play.hidden = true;
  const skip = document.createElement('button'); skip.className = 'wake-film-skip';
  skip.textContent = 'Skip scene';
  layer.append(video, play, skip); parent.appendChild(layer);
  let settled = false, disposed = false, timer, resolve;
  const finished = new Promise(r => { resolve = r; });
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => finish(false), 30000); };
  const finish = ok => {
    if (settled) return;
    settled = true; clearTimeout(timer); video.pause(); play.hidden = skip.hidden = true;
    if (!ok) layer.remove();
    resolve(ok); // successful playback leaves the sleeping frame behind the retry card
  };
  const attempt = async () => {
    play.hidden = true;
    try { await video.play(); }
    catch (e) {
      if (disposed || settled) return;
      if (e.name !== 'NotAllowedError') { finish(false); return; }
      video.muted = true;
      try { await video.play(); }
      catch (e2) {
        if (disposed || settled) return;
        if (e2.name !== 'NotAllowedError') { finish(false); return; }
        play.hidden = false; onVisible(); return;
      }
    }
    if (disposed || settled) { video.pause(); return; }
    onVisible();
  };
  play.addEventListener('click', e => { e.stopPropagation(); arm(); attempt(); });
  skip.addEventListener('click', e => { e.stopPropagation(); finish(video.currentTime > 0); });
  // No tap-anywhere skip: a firing thumb still on screen must not dismiss the film.
  layer.addEventListener('pointerdown', e => e.stopPropagation());
  video.addEventListener('ended', () => finish(true));
  video.addEventListener('error', () => finish(false));
  video.addEventListener('timeupdate', () => { if (!settled) arm(); });
  arm(); attempt();
  return { finished, dispose() {
    disposed = true; finish(false); clearTimeout(timer); video.pause();
    video.removeAttribute('src'); video.load(); layer.remove();
  } };
}
