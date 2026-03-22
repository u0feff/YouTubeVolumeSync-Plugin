// ==UserScript==
// @name         YouTube volume sync
// @description  Fixes volume desync between KDE Connect via Plasma integration and youtube player
// @match        *://*.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
  const APP_NAME = "YouTube volume sync";

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

    /**
     * @param {number} videoVolume
     * @returns {number}
     */
    function normalizeVideoVolume(videoVolume) {
      return Number(videoVolume.toFixed(2));
    }

    function recalculateVolumeMaps() {
      const currentPlayerVolume = player.getVolume();
      let tempVideoVolume;

      Object.defineProperty(video, "volume", {
        get: getVideoVolume,
        set: function (value) {
          tempVideoVolume = value;
        },
        configurable: true,
      });

      try {
        for (let i = 0; i <= 100; i++) {
          player.setVolume(i);

          const normalizedVideoVolume = normalizeVideoVolume(tempVideoVolume);

          videoToPlayerVolumeMap[normalizedVideoVolume] = i;
          playerToVideoVolumeMap[i] = normalizedVideoVolume;
        }

        Object.defineProperty(video, "volume", {
          get: getVideoVolume,
          set: function () {},
          configurable: true,
        });

        player.setVolume(currentPlayerVolume);
      } finally {
        Object.defineProperty(video, "volume", {
          get: getVideoVolume,
          set: setVideoVolume,
          configurable: true,
        });
      }

      log(`Volume maps recalculated`, `map:`, playerToVideoVolumeMap);
    }

    /**
     * @param {number} playerVolume
     * @returns {number}
     */
    function calculateVideoVolume(playerVolume) {
      return playerToVideoVolumeMap[playerVolume];
    }

    /**
     * @param {number} videoVolume
     * @returns {number?}
     */
    function tryCalculatePlayerVolume(videoVolume) {
      const normalizedVideoVolume = normalizeVideoVolume(videoVolume);

      if (normalizedVideoVolume in videoToPlayerVolumeMap)
        return videoToPlayerVolumeMap[normalizedVideoVolume];

      if (normalizedVideoVolume <= playerToVideoVolumeMap[0]) return 0;
      if (normalizedVideoVolume >= playerToVideoVolumeMap[100]) return 100;

      return null;
    }

    /**
     * @returns {number}
     */
    function getVideoVolume() {
      return originalVideoVolumeProperty.get.call(this);
    }

    /**
     * @param {number} videoVolume
     */
    function setVideoVolume(videoVolume) {
      const normalizedVideoVolume = normalizeVideoVolume(videoVolume);

      if (
        !(normalizedVideoVolume in videoToPlayerVolumeMap) &&
        normalizedVideoVolume >= playerToVideoVolumeMap[0] &&
        normalizedVideoVolume <= playerToVideoVolumeMap[100]
      ) {
        log(
          `Recalculating volume maps. Video volume not in map`,
          `video volume:`,
          normalizedVideoVolume,
          `, map:`,
          playerToVideoVolumeMap,
        );

        recalculateVolumeMaps();
      }

      // Volume can be mapped to same value from different source value,
      // so we should check it vice versa too
      if (
        videoToPlayerVolumeMap[normalizedVideoVolume] !== player.getVolume() &&
        playerToVideoVolumeMap[player.getVolume()] !== normalizedVideoVolume
      ) {
        log(
          `Recalculating volume maps. Map inconsistency for current player/video volume`,
          `video volume:`,
          normalizedVideoVolume,
          `, player volume: actual`,
          videoToPlayerVolumeMap[normalizedVideoVolume],
          `/ expected`,
          player.getVolume(),
          `, map:`,
          playerToVideoVolumeMap,
        );

        recalculateVolumeMaps();
      }

      originalVideoVolumeProperty.set.call(this, videoVolume);
    }

    /**
     * @returns {number}
     */
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
      get: getVideoVolume,
      set: setVideoVolume,
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

      // The problem is that volumechange event triggered by changes from both other extensions and YouTube,
      // while the volume property triggered only when changes are made from YouTube.
      // It's impossible to determine source of event from volumechange,
      // so we're trying to determine this using volume map, which is based on YouTube's player volume normalization.
      // If current player volume and video volume don't match,
      // it means volume change was made on video, and we need to synchronize player's volume with video.
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
