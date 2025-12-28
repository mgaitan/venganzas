const state = {
  posts: [],
  filtered: [],
  pageSize: 50,
  page: 0,
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  yearFilter: document.getElementById("yearFilter"),
  monthFilter: document.getElementById("monthFilter"),
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
  const tokens = query ? query.split(" ") : [];

  state.filtered = state.posts.filter((post) => {
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

elements.clearBtn.addEventListener("click", () => {
  elements.searchInput.value = "";
  elements.yearFilter.value = "";
  elements.monthFilter.value = "";
  applyFilters();
});

elements.loadMore.addEventListener("click", () => {
  state.page += 1;
  renderResults();
});

init();
