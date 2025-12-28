const state = {
  posts: [],
  filtered: [],
  pageSize: 50,
  page: 0,
  offline: {},
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  yearFilter: document.getElementById("yearFilter"),
  monthFilter: document.getElementById("monthFilter"),
  offlineToggle: document.getElementById("offlineToggle"),
  offlineCount: document.getElementById("offlineCount"),
  offlineClear: document.getElementById("offlineClear"),
  clearBtn: document.getElementById("clearBtn"),
  status: document.getElementById("status"),
  resultsCount: document.getElementById("resultsCount"),
  resultsList: document.getElementById("resultsList"),
  loadMore: document.getElementById("loadMore"),
};

const STORAGE_KEY = "vdp-progress";
const OFFLINE_KEY = "vdp-offline-audio";
const OFFLINE_CACHE = "vdp-offline-audio-v1";

const loadOffline = () => {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
};

const saveOffline = (offline) => {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(offline));
};

const updateOfflineSummary = () => {
  if (!elements.offlineCount || !elements.offlineClear) return;
  const count = Object.keys(state.offline).length;
  elements.offlineCount.textContent = `${count} descargados`;
  elements.offlineClear.disabled = count === 0;
};

const isOfflineSaved = (post) => {
  const saved = state.offline[post.id];
  return saved && saved.url === post.audio_url;
};

const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {
    updateStatus("No se pudo registrar el modo offline.");
  });
};

const loadAudioFromCache = async (audio, url) => {
  if (!("caches" in window)) return;
  const cache = await caches.open(OFFLINE_CACHE);
  const response = await cache.match(url);
  if (!response) return;
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  if (audio.dataset.objectUrl) {
    URL.revokeObjectURL(audio.dataset.objectUrl);
  }
  audio.dataset.objectUrl = objectUrl;
  audio.src = objectUrl;
  audio.load();
};

const normalizeText = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const updateStatus = (message) => {
  elements.status.textContent = message;
};

const loadProgress = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
};

const saveProgress = (progress) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
};

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const buildYearOptions = () => {
  const years = Array.from(new Set(state.posts.map((post) => post.year)))
    .filter(Boolean)
    .sort((a, b) => Number(b) - Number(a));
  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    elements.yearFilter.appendChild(option);
  });
};

const createCard = (post) => {
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("h3");
  title.textContent = post.title;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = post.date ? post.date : "Fecha sin datos";

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent =
    post.has_transcription === "1" ? "Con transcripcion" : "Sin transcripcion";

  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "none";

  if (post.audio_url) {
    const source = document.createElement("source");
    source.src = post.audio_url;
    source.type = "audio/mpeg";
    audio.appendChild(source);
  }

  const links = document.createElement("div");
  const postLink = document.createElement("a");
  postLink.href = post.post_url;
  postLink.target = "_blank";
  postLink.rel = "noopener";
  postLink.textContent = "Abrir en Venganzas";
  links.appendChild(postLink);

  if (post.audio_url) {
    const offlineWrap = document.createElement("div");
    offlineWrap.className = "offline-actions";

    const offlineStatus = document.createElement("span");
    offlineStatus.className = "offline-status";
    offlineStatus.textContent = isOfflineSaved(post)
      ? "Disponible offline"
      : "No descargado";

    const offlineButton = document.createElement("button");
    offlineButton.type = "button";
    offlineButton.className = "offline-btn";
    offlineButton.textContent = isOfflineSaved(post)
      ? "Quitar offline"
      : "Guardar offline";

    const setOfflineUI = (saved) => {
      offlineStatus.textContent = saved
        ? "Disponible offline"
        : "No descargado";
      offlineButton.textContent = saved ? "Quitar offline" : "Guardar offline";
      if (elements.offlineToggle && elements.offlineToggle.checked) {
        applyFilters();
      }
    };

    offlineButton.addEventListener("click", async () => {
      if (!("caches" in window)) {
        updateStatus("Tu navegador no soporta cache offline.");
        return;
      }
      offlineButton.disabled = true;
      if (!isOfflineSaved(post)) {
        updateStatus("Descargando audio para offline...");
        try {
          const cache = await caches.open(OFFLINE_CACHE);
          await cache.add(new Request(post.audio_url, { mode: "cors" }));
          state.offline[post.id] = {
            url: post.audio_url,
            saved_at: Date.now(),
          };
          saveOffline(state.offline);
          updateOfflineSummary();
          setOfflineUI(true);
          updateStatus("Audio guardado para offline.");
        } catch (error) {
          updateStatus("No se pudo guardar el audio offline.");
        }
      } else {
        try {
          const cache = await caches.open(OFFLINE_CACHE);
          await cache.delete(post.audio_url);
          delete state.offline[post.id];
          saveOffline(state.offline);
          updateOfflineSummary();
          setOfflineUI(false);
          updateStatus("Audio eliminado del modo offline.");
        } catch (error) {
          updateStatus("No se pudo borrar el audio offline.");
        }
      }
      offlineButton.disabled = false;
    });

    offlineWrap.appendChild(offlineStatus);
    offlineWrap.appendChild(offlineButton);
    links.appendChild(offlineWrap);
  }

  const progress = loadProgress();
  const saved = progress[post.id];
  if (saved && saved.time > 5) {
    const resume = document.createElement("div");
    resume.className = "resume";

    const resumeText = document.createElement("span");
    resumeText.textContent = `Continuar desde ${formatTime(saved.time)}`;

    const resumeButton = document.createElement("button");
    resumeButton.type = "button";
    resumeButton.className = "resume-btn";
    resumeButton.textContent = "Reanudar";
    resumeButton.addEventListener("click", () => {
      audio.currentTime = saved.time;
      audio.play();
    });

    resume.appendChild(resumeText);
    resume.appendChild(resumeButton);
    card.appendChild(resume);
  }

  card.appendChild(badge);
  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(audio);
  card.appendChild(links);

  return card;
};

const attachProgressTracker = (post, audio) => {
  let lastSaved = 0;
  const progress = loadProgress();

  const persist = () => {
    if (!Number.isFinite(audio.currentTime) || audio.currentTime <= 0) return;
    progress[post.id] = {
      time: audio.currentTime,
      updated_at: Date.now(),
    };
    saveProgress(progress);
  };

  audio.addEventListener("timeupdate", () => {
    if (audio.currentTime - lastSaved > 8) {
      lastSaved = audio.currentTime;
      persist();
    }
  });

  audio.addEventListener("pause", persist);
  audio.addEventListener("ended", () => {
    delete progress[post.id];
    saveProgress(progress);
  });

  audio.addEventListener("play", async () => {
    if (!navigator.onLine && isOfflineSaved(post)) {
      await loadAudioFromCache(audio, post.audio_url);
    }
  });
};

const renderResults = () => {
  elements.resultsList.innerHTML = "";
  const limit = (state.page + 1) * state.pageSize;
  const slice = state.filtered.slice(0, limit);
  slice.forEach((post) => {
    const card = createCard(post);
    const audio = card.querySelector("audio");
    if (audio) {
      attachProgressTracker(post, audio);
    }
    elements.resultsList.appendChild(card);
  });

  elements.resultsCount.textContent = `${state.filtered.length} resultados`;
  elements.loadMore.hidden = slice.length >= state.filtered.length;
};

const applyFilters = () => {
  const query = normalizeText(elements.searchInput.value || "");
  const year = elements.yearFilter.value;
  const month = elements.monthFilter.value;
  const offlineOnly = elements.offlineToggle && elements.offlineToggle.checked;
  const tokens = query ? query.split(" ") : [];

  state.filtered = state.posts.filter((post) => {
    if (offlineOnly && !isOfflineSaved(post)) return false;
    if (year && post.year !== year) return false;
    if (month && post.month !== month) return false;

    if (!tokens.length) return true;
    let haystack = post._search;
    return tokens.every((token) => haystack.includes(token));
  });

  state.page = 0;
  renderResults();
};

const debounce = (fn, wait = 200) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
};

const init = async () => {
  state.offline = loadOffline();
  updateOfflineSummary();
  updateStatus("Cargando indice...");
  try {
    const response = await fetch("data/index.json", { cache: "no-store" });
    const data = await response.json();
    state.posts = (data.posts || []).map((post) => {
      const searchBlob = normalizeText(
        `${post.title} ${post.date} ${post.year || ""} ${post.month || ""} ${post.id}`,
      );
      return { ...post, _search: searchBlob };
    });
    buildYearOptions();
    state.filtered = state.posts;
    renderResults();
    updateStatus("Indice listo.");
  } catch (error) {
    updateStatus("No se pudo cargar data/index.json");
  }
};

const debouncedFilter = debounce(applyFilters, 200);

elements.searchInput.addEventListener("input", debouncedFilter);
elements.yearFilter.addEventListener("change", applyFilters);
elements.monthFilter.addEventListener("change", applyFilters);
if (elements.offlineToggle) {
  elements.offlineToggle.addEventListener("change", applyFilters);
}
if (elements.offlineClear) {
  elements.offlineClear.addEventListener("click", async () => {
    if (!("caches" in window)) {
      updateStatus("Tu navegador no soporta cache offline.");
      return;
    }
    elements.offlineClear.disabled = true;
    try {
      await caches.delete(OFFLINE_CACHE);
      state.offline = {};
      saveOffline(state.offline);
      updateOfflineSummary();
      updateStatus("Descargas offline eliminadas.");
      if (elements.offlineToggle && elements.offlineToggle.checked) {
        applyFilters();
      }
    } catch (error) {
      updateStatus("No se pudieron limpiar las descargas.");
    } finally {
      updateOfflineSummary();
    }
  });
}

elements.clearBtn.addEventListener("click", () => {
  elements.searchInput.value = "";
  elements.yearFilter.value = "";
  elements.monthFilter.value = "";
  if (elements.offlineToggle) {
    elements.offlineToggle.checked = false;
  }
  applyFilters();
});

elements.loadMore.addEventListener("click", () => {
  state.page += 1;
  renderResults();
});

init();
registerServiceWorker();

window.addEventListener("offline", () => {
  updateStatus("Sin conexion. Modo offline activo.");
});

window.addEventListener("online", () => {
  updateStatus("Conexion restablecida.");
});
