const state = {
  posts: [],
  filtered: [],
  transcripts: null,
  transcriptsNormalized: null,
  transcriptsPromise: null,
  pageSize: 50,
  page: 0,
  loadingTranscripts: false,
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  yearFilter: document.getElementById("yearFilter"),
  monthFilter: document.getElementById("monthFilter"),
  transcriptToggle: document.getElementById("transcriptToggle"),
  clearBtn: document.getElementById("clearBtn"),
  status: document.getElementById("status"),
  resultsCount: document.getElementById("resultsCount"),
  resultsList: document.getElementById("resultsList"),
  loadMore: document.getElementById("loadMore"),
};

const STORAGE_KEY = "vdp-progress";

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

  let transcriptWrap = null;
  if (post.has_transcription === "1") {
    transcriptWrap = document.createElement("div");
    transcriptWrap.className = "transcript-wrap";

    const transcriptButton = document.createElement("button");
    transcriptButton.type = "button";
    transcriptButton.className = "transcript-toggle";
    transcriptButton.textContent = state.transcripts
      ? "Ver transcripcion"
      : "Cargar transcripcion";

    const transcriptBody = document.createElement("div");
    transcriptBody.className = "transcript";
    transcriptBody.hidden = true;

    transcriptButton.addEventListener("click", async () => {
      if (!state.transcripts) {
        transcriptButton.textContent = "Cargando...";
        await loadTranscripts();
      }
      if (!transcriptBody.dataset.loaded) {
        renderTranscript(post, transcriptBody, audio);
        transcriptBody.dataset.loaded = "1";
      }
      transcriptBody.hidden = !transcriptBody.hidden;
      transcriptButton.textContent = transcriptBody.hidden
        ? "Ver transcripcion"
        : "Ocultar transcripcion";
    });

    transcriptWrap.appendChild(transcriptButton);
    transcriptWrap.appendChild(transcriptBody);
  }

  card.appendChild(badge);
  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(audio);
  card.appendChild(links);
  if (transcriptWrap) {
    card.appendChild(transcriptWrap);
  }

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
};

const getTranscriptPayload = (postId) => {
  if (!state.transcripts) return null;
  const payload = state.transcripts[postId];
  if (!payload) return null;
  if (typeof payload === "string") {
    return { text: payload, segments: [] };
  }
  return {
    text: payload.text || "",
    segments: Array.isArray(payload.segments) ? payload.segments : [],
  };
};

const renderTranscript = (post, container, audio) => {
  const payload = getTranscriptPayload(post.id);
  if (!payload) {
    container.textContent = "Transcripcion no disponible.";
    return;
  }
  if (!payload.segments.length) {
    container.textContent = payload.text || "Transcripcion no disponible.";
    return;
  }

  const lines = [];
  const times = [];

  payload.segments.forEach((segment) => {
    const line = document.createElement("button");
    line.type = "button";
    line.className = "transcript-line";
    line.dataset.time = segment.t;

    const time = document.createElement("span");
    time.className = "transcript-time";
    time.textContent = segment.label || "";

    const text = document.createElement("span");
    text.className = "transcript-text";
    text.textContent = segment.text || "";

    line.appendChild(time);
    line.appendChild(text);

    line.addEventListener("click", () => {
      if (!Number.isNaN(segment.t)) {
        audio.currentTime = segment.t;
        audio.play();
      }
    });

    container.appendChild(line);
    lines.push(line);
    times.push(segment.t || 0);
  });

  bindKaraoke(audio, container, lines, times);
};

const bindKaraoke = (audio, container, lines, times) => {
  let lastIndex = -1;

  const findIndex = (current) => {
    let lo = 0;
    let hi = times.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (times[mid] <= current) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  };

  const update = () => {
    if (container.hidden) return;
    const current = audio.currentTime + 0.2;
    const index = findIndex(current);
    if (index === lastIndex) return;
    if (lastIndex >= 0 && lines[lastIndex]) {
      lines[lastIndex].classList.remove("active");
    }
    if (index >= 0 && lines[index]) {
      lines[index].classList.add("active");
      lines[index].scrollIntoView({ block: "nearest" });
    }
    lastIndex = index;
  };

  audio.addEventListener("timeupdate", update);
  audio.addEventListener("seeked", update);
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
  const includeTranscripts =
    elements.transcriptToggle.checked && state.transcriptsNormalized;
  const tokens = query ? query.split(" ") : [];

  state.filtered = state.posts.filter((post) => {
    if (year && post.year !== year) return false;
    if (month && post.month !== month) return false;

    if (!tokens.length) return true;
    let haystack = post._search;
    if (includeTranscripts) {
      const transcript = state.transcriptsNormalized[post.id];
      if (transcript) {
        haystack = `${haystack} ${transcript}`;
      }
    }

    return tokens.every((token) => haystack.includes(token));
  });

  state.page = 0;
  renderResults();
};

const loadTranscripts = () => {
  if (state.transcriptsPromise) {
    return state.transcriptsPromise;
  }
  if (state.transcriptsNormalized) {
    return Promise.resolve();
  }
  state.loadingTranscripts = true;
  updateStatus("Cargando transcripciones...");
  state.transcriptsPromise = (async () => {
    try {
      const response = await fetch("data/transcripts.json", {
        cache: "no-store",
      });
      if (!response.ok) {
        updateStatus(
          "No se encontro transcripts.json. Ejecuta el scraper con --with-transcripts.",
        );
        return;
      }
      state.transcripts = await response.json();
      state.transcriptsNormalized = {};
      Object.entries(state.transcripts).forEach(([id, payload]) => {
        if (typeof payload === "string") {
          state.transcriptsNormalized[id] = normalizeText(payload);
          return;
        }
        if (payload && typeof payload === "object") {
          state.transcriptsNormalized[id] = normalizeText(payload.text || "");
        }
      });
      updateStatus("Transcripciones listas.");
    } catch (error) {
      updateStatus("Error al cargar transcripciones.");
    } finally {
      state.loadingTranscripts = false;
      applyFilters();
      state.transcriptsPromise = null;
    }
  })();
  return state.transcriptsPromise;
};

const debounce = (fn, wait = 200) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
};

const init = async () => {
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
elements.transcriptToggle.addEventListener("change", () => {
  if (elements.transcriptToggle.checked) {
    loadTranscripts();
  } else {
    applyFilters();
  }
});

elements.clearBtn.addEventListener("click", () => {
  elements.searchInput.value = "";
  elements.yearFilter.value = "";
  elements.monthFilter.value = "";
  elements.transcriptToggle.checked = false;
  applyFilters();
});

elements.loadMore.addEventListener("click", () => {
  state.page += 1;
  renderResults();
});

init();
