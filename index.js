// ==UserScript==
// @name         YouTube KDE volume sync
// @description  Fixes volume desync between KDE Connect via Plasma integration and youtube player
// @match        *://*.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
  const APP_NAME = "YouTube KDE volume sync";

  const VIDEO_QUERY = "video.html5-main-video";
  const PLAYER_QUERY = "#movie_player";

  const PLAYER_VOLUME_KEY = "yt-player-volume";
  const EXPIRATION_PERIOD = 30 * 24 * 3600 * 1e3;

  function tryBindPlayer() {
    const video = document.querySelector(VIDEO_QUERY);
    const player = document.querySelector(PLAYER_QUERY);

    if (!video || !player || video.dataset.volumeSync) return;

    video.dataset.volumeSync = "true";

    const originalVideoVolumeProperty = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "volume",
    );

    const videoToPlayerVolumeMap = {};
    const playerToVideoVolumeMap = {};

    function log(message, ...args) {
      console.log(`[${APP_NAME}] ${message}\n`, ...args);
    }

    function recalculateVolumeMaps() {
      const currentVolume = player.getVolume();
      let tempVolume;

      Object.defineProperty(video, "volume", {
        get: getVolume,
        set: function (value) {
          tempVolume = value;
        },
        configurable: true,
      });

      try {
        for (let i = 0; i <= 100; i++) {
          player.setVolume(i);

          const normalizedTempVolume = Number(tempVolume.toFixed(2));

          videoToPlayerVolumeMap[normalizedTempVolume] = i;
          playerToVideoVolumeMap[i] = normalizedTempVolume;
        }

        Object.defineProperty(video, "volume", {
          get: getVolume,
          set: function () {},
          configurable: true,
        });

        player.setVolume(currentVolume);
      } finally {
        Object.defineProperty(video, "volume", {
          get: getVolume,
          set: setVolume,
          configurable: true,
        });
      }

      log(`Volume maps recalculated`, `map:`, playerToVideoVolumeMap);
    }

    /**
     * @param {number} playerVolume
     */
    function calculateVideoVolume(playerVolume) {
      return playerToVideoVolumeMap[playerVolume];
    }

    /**
     * @param {number} volume
     */
    function tryCalculatePlayerVolume(volume) {
      const normalizedVolume = Number(volume.toFixed(2));

      if (normalizedVolume in videoToPlayerVolumeMap)
        return videoToPlayerVolumeMap[normalizedVolume];

      if (normalizedVolume <= playerToVideoVolumeMap[0]) return 0;
      if (normalizedVolume >= playerToVideoVolumeMap[100]) return 100;

      return null;
    }

    function getVolume() {
      return originalVideoVolumeProperty.get.call(this);
    }

    function setVolume(volume) {
      const normalizedVolume = Number(volume.toFixed(2));

      if (
        !(normalizedVolume in videoToPlayerVolumeMap) &&
        normalizedVolume >= playerToVideoVolumeMap[0] &&
        normalizedVolume <= playerToVideoVolumeMap[100]
      ) {
        log(
          `Recalculating volume maps. Video volume not in map`,
          `video volume:`,
          normalizedVolume,
          `, map:`,
          playerToVideoVolumeMap,
        );

        recalculateVolumeMaps();
      }

      // Volume can be mapped to same value from different source value,
      // so we should check it vice versa too
      if (
        videoToPlayerVolumeMap[normalizedVolume] !== player.getVolume() &&
        playerToVideoVolumeMap[player.getVolume()] !== normalizedVolume
      ) {
        log(
          `Recalculating volume maps. Map inconsistency for current player/video volume`,
          `video volume:`,
          normalizedVolume,
          `, player volume: actual`,
          videoToPlayerVolumeMap[normalizedVolume],
          `/ expected`,
          player.getVolume(),
          `, map:`,
          playerToVideoVolumeMap,
        );

        recalculateVolumeMaps();
      }

      originalVideoVolumeProperty.set.call(this, volume);
    }

    function getPlayerVolume() {
      return player.getVolume();
    }

    /**
     * @param {number} playerVolume
     */
    function setPlayerVolume(playerVolume) {
      player.setVolume(playerVolume);

      const now = Date.now();

      window.localStorage[PLAYER_VOLUME_KEY] = JSON.stringify({
        creation: now,
        expiration: now + EXPIRATION_PERIOD,
        data: JSON.stringify({
          volume: playerVolume,
          muted: video.muted,
        }),
      });
    }

    Object.defineProperty(video, "volume", {
      get: getVolume,
      set: setVolume,
      configurable: true,
    });

    recalculateVolumeMaps();

    video.addEventListener("volumechange", (e) => {
      const oldPlayerVolume = getPlayerVolume();
      const newPlayerVolume = tryCalculatePlayerVolume(video.volume);

      if (newPlayerVolume === null) {
        log(
          `Cannot calculate player volume from video volume`,
          `player volume: old`,
          oldPlayerVolume,
          `/ new`,
          newPlayerVolume,
          `, video volume:`,
          video.volume,
        );

        return;
      }

      if (Math.abs(oldPlayerVolume - newPlayerVolume) <= 1) return;

      log(
        `Volume sync`,
        `player volume: old`,
        oldPlayerVolume,
        `/ new`,
        newPlayerVolume,
        `, video volume:`,
        video.volume,
      );

      setPlayerVolume(newPlayerVolume);
    });
  }

  const observer = new MutationObserver(() => {
    tryBindPlayer();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  tryBindPlayer();
})();
