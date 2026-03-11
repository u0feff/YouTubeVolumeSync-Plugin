// ==UserScript==
// @name         YouTube KDE volume sync
// @description  Fixes desync between "Plasma integration" and youtube player volume changes
// @match        *://*.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
  const APP_NAME = "YouTube KDE volume sync";

  const VIDEO_QUERY = "video.html5-main-video";
  const PLAYER_QUERY = "#movie_player";

  const YT_PLAYER_VOLUME_KEY = "yt-player-volume";
  const EXPIRATION_PERIOD = 30 * 24 * 3600 * 1e3;

  function tryBindPlayer() {
    const video = document.querySelector(VIDEO_QUERY);
    const player = document.querySelector(PLAYER_QUERY);

    if (!video || !player || video.dataset.volumeSync) return;

    video.dataset.volumeSync = "true";

    /**
     * @param {number} volume
     */
    function setVolume(volume) {
      player.setVolume(volume);

      const now = Date.now();

      window.localStorage[YT_PLAYER_VOLUME_KEY] = JSON.stringify({
        creation: now,
        expiration: now + EXPIRATION_PERIOD,
        data: JSON.stringify({
          volume: volume,
          muted: video.muted,
        }),
      });
    }

    video.addEventListener("volumechange", (e) => {
      const wrapperVolume = player.getVolume();
      const actualVolume = Math.round(video.volume * 100);

      // If volume changed from player
      if (Math.abs(wrapperVolume - actualVolume) < 1) return;

      console.log(
        `${APP_NAME}: wrapper ${wrapperVolume} / actual ${actualVolume}`,
      );

      setVolume(actualVolume);
    });
  }

  const observer = new MutationObserver(() => {
    tryBindPlayer();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  tryBindPlayer();
})();
