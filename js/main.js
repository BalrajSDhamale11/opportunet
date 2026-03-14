/* ==============================================================
   FILE: js/main.js
   PURPOSE: All JavaScript for OpportuNet.
   
   Sections:
     1. EmailJS Config   — placeholders + setup instructions
     2. Nav Toggle       — mobile hamburger menu
     3. Save Badge       — updates "My List" count on all pages
     4. Hackathons Page  — fetch, render, search, filter, save
     5. Open Source Page — GitHub API fetch, render, filter
     6. Saved Page       — render from localStorage, remove
   ============================================================== */


/* ==============================================================
   SECTION 1: EMAILJS CONFIGURATION
   
   HOW TO SET UP (free, takes 5 minutes):
   1. Go to https://www.emailjs.com and create a free account
   2. Add an "Email Service" (Gmail works) → copy the Service ID
   3. Create an "Email Template" — add these variables in the
      template body: {{user_email}}, {{to_name}}
   4. Copy the Template ID and your Public Key from the dashboard
   5. Paste them into the three constants below
   ============================================================== */
const EMAILJS_SERVICE_ID  = "service_2znrjll";   /* e.g. "service_abc123" */
const EMAILJS_TEMPLATE_ID = "template_2wdbmsi";  /* e.g. "template_xyz789" */
const EMAILJS_PUBLIC_KEY  = "lg8ZguQetppgRj_pY";   /* e.g. "user_XXXXXXXX"  */

/* ==============================================================
   SUPABASE CONFIGURATION
   Replace the placeholders with your actual credentials
   from Supabase Dashboard → Settings → Data API + API Keys
   ============================================================== */
const SUPABASE_URL  = "https://iqapuxoiqamhxhymozsh.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxYXB1eG9pcWFtaHhoeW1venNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0Nzc0MjYsImV4cCI6MjA4OTA1MzQyNn0.vZOMvjollXwE83GdLuJt5CJcOltHqUXHWgdbch-_WOQ";
/* Set to true to force JSON, false to use Supabase */
const USE_JSON_FALLBACK = false;
/* ==============================================================
   SECTION 2: MOBILE NAV TOGGLE
   ============================================================== */
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => navLinks.classList.remove('open'));
  });
}


/* ==============================================================
   SECTION 3: SAVE COUNT BADGE
   
   Reads the saved list from localStorage and updates the
   number shown on the "My List" nav link across all pages.
   Called once on page load and again whenever saves change.
   ============================================================== */

/* ==============================================================
   URGENCY BADGE
   Calculates days left from a date string and returns
   a badge HTML string with appropriate color.
   ============================================================== */
function getUrgencyBadge(regDeadline, eventEnd) {
  if (!regDeadline || !eventEnd) return '';

  const today   = new Date();
  const regDate = new Date(regDeadline);
  const endDate = new Date(eventEnd);

  today.setHours(0, 0, 0, 0);
  regDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  const daysToReg = Math.ceil((regDate - today) / (1000 * 60 * 60 * 24));

  if (today > endDate)
    return `<span class="urgency-badge urgency--closed">⚫ Event Ended</span>`;
  if (today > regDate)
    return `<span class="urgency-badge urgency--soon">🟡 Reg. Closed</span>`;
  if (daysToReg <= 7)
    return `<span class="urgency-badge urgency--hot">🔴 Reg. closes in ${daysToReg}d</span>`;
  return `<span class="urgency-badge urgency--open">🟢 Reg. Open</span>`;
}

/**
 * Returns the array of saved hackathon objects from localStorage.
 * If nothing is saved yet, returns an empty array.
 */
function getSavedList() {
  const raw = localStorage.getItem('opportunet_saved');
  return raw ? JSON.parse(raw) : [];
}

/**
 * Writes the given array back to localStorage.
 * @param {Array} list - array of hackathon objects
 */
function setSavedList(list) {
  localStorage.setItem('opportunet_saved', JSON.stringify(list));
}

/**
 * Reads saved count from localStorage and updates the badge
 * element in the navbar. Badge hides itself when count is 0.
 */
function updateBadge() {
  const badge = document.getElementById('savedBadge');
  if (!badge) return;

  const count = getSavedList().length;
  badge.textContent = count;

  /* Show badge only if there's at least 1 saved item */
  if (count > 0) {
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

/* Run badge update immediately on every page load */
updateBadge();


/* ==============================================================
   SECTION 4: HACKATHONS PAGE
   Only activates when #hackGrid is found in the DOM.
   ============================================================== */
const hackGrid      = document.getElementById('hackGrid');
const hackSearch    = document.getElementById('hackSearch');
const hackFilters   = document.getElementById('hackFilters');
const hackLoading   = document.getElementById('hackLoading');
const hackNoResults = document.getElementById('hackNoResults');

if (hackGrid) {

  let allHackathons = []; /* master list, never mutated after fetch */
  let activeTag = 'All';  /* currently selected tag filter */

  /* ----------------------------------------------------------
     4a. Fetch hackathons.json
     ---------------------------------------------------------- */
  /* Supabase credentials */
/* ----------------------------------------------------------
     Helper: normalize hackathon data from either source.
     Supabase returns tags as "General,Web,ML" string.
     JSON file returns tags as ["General","Web","ML"] array.
     This function handles both formats.
     ---------------------------------------------------------- */
  function normalizeHackathons(data, fromSupabase) {
    return data.map(hack => ({
      ...hack,
      tags: fromSupabase
        ? (hack.tags ? hack.tags.split(',').map(t => t.trim()) : [])
        : (Array.isArray(hack.tags) ? hack.tags : [])
    }));
  }

  /* ----------------------------------------------------------
     Helper: load from local JSON fallback
     Called when Supabase fails or returns empty data.
     ---------------------------------------------------------- */
  function loadFromJSON() {
    console.warn('Supabase unavailable — falling back to local JSON');
    fetch('data/hackathons.json')
      .then(res => {
        if (!res.ok) throw new Error('Could not load hackathons.json');
        return res.json();
      })
      .then(data => {
        allHackathons = normalizeHackathons(data, false);
        if (hackLoading) hackLoading.remove();
        renderHackathons(allHackathons);
      })
      .catch(err => {
        if (hackLoading) {
          hackLoading.textContent =
            '⚠️ Could not load hackathons. Please try again later.';
        }
        console.error('JSON fallback also failed:', err);
      });
  }

  

  /* ----------------------------------------------------------
     4a. Fetch from Supabase with JSON fallback
     Priority: Supabase → JSON fallback
     Manual override: set USE_JSON_FALLBACK = true to skip Supabase
     ---------------------------------------------------------- */
  if (USE_JSON_FALLBACK) {
    loadFromJSON();
  } else {
    fetch(`${SUPABASE_URL}/rest/v1/hackathons?select=*&order=regDeadline.asc`, {
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        /* If Supabase returns empty array → fallback to JSON */
        if (!data || data.length === 0) {
          console.warn('Supabase returned empty data — falling back to JSON');
          loadFromJSON();
          return;
        }
        /* Supabase returned data successfully */
        allHackathons = normalizeHackathons(data, true);
        if (hackLoading) hackLoading.remove();
        renderHackathons(allHackathons);
      })
      .catch(err => {
        /* Supabase completely failed → fallback to JSON */
        console.error('Supabase fetch failed:', err);
        loadFromJSON();
      });
  }
  /* ----------------------------------------------------------
     4b. Render hackathon cards into #hackGrid
     
     Uses a unique key per card (hackathon name slug) so the
     save button can look up the correct item in localStorage.
     ---------------------------------------------------------- */
  function renderHackathons(list) {
    /* Show / hide the "no results" message */
    hackNoResults.style.display = list.length === 0 ? 'block' : 'none';

    removeHackCards();
    if (list.length === 0) return;

    const saved = getSavedList();

    const html = list.map(hack => {
      /* Create a simple slug key to identify this hackathon */
      const key = slugify(hack.name);

      /* Check if this hackathon is already in localStorage */
      const isSaved = saved.some(s => slugify(s.name) === key);
      const saveLabel = isSaved ? '✅ Saved' : '🔖 Save';
      const saveClass = isSaved ? 'btn-save saved' : 'btn-save';

      return `
        <div class="card">
          <div class="card-top-row">
            <span class="card-platform">${hack.platform}</span>
            <span class="card-prize">🏆 ${hack.prize}</span>
          </div>
          <h3 class="card-title">${hack.name}</h3>
         ${getUrgencyBadge(hack.regDeadline, hack.eventEnd)}
          <p class="card-date">📅 ${hack.date}</p>
          <p class="card-desc">${hack.description}</p>
          <div class="card-tags">
            ${hack.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
          <div class="card-actions">
            <a href="${hack.registerLink}" target="_blank" rel="noopener noreferrer"
               class="btn btn--primary card-btn">Register Now →</a>
            <button class="${saveClass}" data-key="${key}">
              ${saveLabel}
            </button>
          </div>
        </div>
      `;
    }).join('');

    hackGrid.insertAdjacentHTML('beforeend', html);
  }

  /* Removes previously rendered cards (keeps the static elements) */
  function removeHackCards() {
    hackGrid.querySelectorAll('.card').forEach(c => c.remove());
  }

  /* ----------------------------------------------------------
     4c. Combined search + tag filter
     ---------------------------------------------------------- */
  function applyFilters() {
    const query = hackSearch ? hackSearch.value.trim().toLowerCase() : '';

    const filtered = allHackathons.filter(hack => {
      const tagMatch    = activeTag === 'All' || hack.tags.includes(activeTag);
      const searchMatch = hack.name.toLowerCase().includes(query) ||
                          hack.platform.toLowerCase().includes(query);
      return tagMatch && searchMatch;
    });

    renderHackathons(filtered);
  }

  /* ----------------------------------------------------------
     4d. Search input listener
     ---------------------------------------------------------- */
  if (hackSearch) {
    hackSearch.addEventListener('keyup', applyFilters);
  }

  /* ----------------------------------------------------------
     4e. Tag filter button listener (event delegation)
         One listener on the parent catches all button clicks.
     ---------------------------------------------------------- */
  if (hackFilters) {
    hackFilters.addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      activeTag = btn.dataset.tag;

      hackFilters.querySelectorAll('.filter-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      applyFilters();
    });
  }

  /* ----------------------------------------------------------
     4f. Save button listener (event delegation on the grid)
         Handles both "Save" and "Unsave" in one handler.
     ---------------------------------------------------------- */
  hackGrid.addEventListener('click', e => {
    const btn = e.target.closest('.btn-save');
    if (!btn) return;

    const key  = btn.dataset.key;
    let saved  = getSavedList();

    const alreadySaved = saved.some(s => slugify(s.name) === key);

    if (alreadySaved) {
      /* --- UNSAVE --- */
      saved = saved.filter(s => slugify(s.name) !== key);
      setSavedList(saved);
      btn.textContent = '🔖 Save';
      btn.classList.remove('saved');
    } else {
      /* --- SAVE --- Find the full hackathon object and store it */
      const hack = allHackathons.find(h => slugify(h.name) === key);
      if (hack) {
        saved.push(hack);
        setSavedList(saved);
        btn.textContent = '✅ Saved';
        btn.classList.add('saved');
      }
    }

    /* Refresh badge across all pages */
    updateBadge();
  });

} /* end hackathons section */


/* ==============================================================
   SECTION 5: OPEN SOURCE PAGE
   Only activates when #ossGrid is found in the DOM.
   
   Uses the free GitHub Search API (no key required):
   GET https://api.github.com/search/repositories?q=...
   ============================================================== */
const ossGrid      = document.getElementById('ossGrid');
const ossSpinner   = document.getElementById('ossSpinner');
const ossNoResults = document.getElementById('ossNoResults');
const ossError     = document.getElementById('ossError');
const ossFilters   = document.getElementById('ossFilters');

if (ossGrid) {

  let activeLanguage = 'All'; /* currently selected language filter */

  /* ----------------------------------------------------------
     5a. Fetch repos from GitHub API
     
     Builds a query string using "good-first-issue" label tag
     and optionally filters by programming language.
     ---------------------------------------------------------- */
  function fetchRepos(language) {
    /* Show spinner, hide previous content */
    ossSpinner.style.display = 'block';
    ossError.style.display   = 'none';
    ossNoResults.style.display = 'none';
    removeOssCards();

    /* Build the query: always search for good-first-issue repos */
    let query = 'label:"good-first-issue"';
    if (language !== 'All') {
      query += ` language:${language}`;
    }

    /* Sort by stars so results are high-quality projects */
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=24`;

    fetch(url, {
      headers: {
        /* Asking for the JSON API response format */
        'Accept': 'application/vnd.github.v3+json'
      }
    })
      .then(res => {
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        ossSpinner.style.display = 'none';
        renderRepos(data.items || []);
      })
      .catch(err => {
        ossSpinner.style.display = 'none';
        ossError.style.display   = 'block';
        console.error(err);
      });
  }

  /* ----------------------------------------------------------
     5b. Render repo cards into #ossGrid
     ---------------------------------------------------------- */
function renderRepos(list) {
    const clean = list.filter(repo => {
      const desc = repo.description || '';
      return !desc.includes('{%') && !desc.includes('<%') && !desc.includes('Skip to content');
    });
    ossNoResults.style.display = clean.length === 0 ? 'block' : 'none';
    removeOssCards();
    if (clean.length === 0) return;

    const html = clean.map(repo => `
      <div class="card">
        <p class="card-owner">👤 ${repo.owner.login}</p>
        <h3 class="card-repo-name">${repo.name}</h3>
        <p class="card-repo-desc">${repo.description || 'No description provided.'}</p>
        <div class="card-meta-row">
          <span>⭐ ${formatNumber(repo.stargazers_count)}</span>
          <span>🐛 ${repo.open_issues_count} issues</span>
          ${repo.language ? `<span>💻 ${repo.language}</span>` : ''}
        </div>
        <div class="card-tags">
          <span class="tag tag--green">good-first-issue</span>
          ${repo.language ? `<span class="tag">${repo.language}</span>` : ''}
        </div>
        <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer"
           class="btn btn--primary card-btn" style="margin-top:auto;">
          View on GitHub →
        </a>
      </div>
    `).join('');

    ossGrid.insertAdjacentHTML('beforeend', html);
  }

  function removeOssCards() {
    ossGrid.querySelectorAll('.card').forEach(c => c.remove());
  }

  /* ----------------------------------------------------------
     5c. Language filter button listener (event delegation)
     ---------------------------------------------------------- */
  if (ossFilters) {
    ossFilters.addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      activeLanguage = btn.dataset.lang;

      ossFilters.querySelectorAll('.filter-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      fetchRepos(activeLanguage);
    });
  }

  /* Load default: all languages, good-first-issue */
  fetchRepos('All');

} /* end open source section */


/* ==============================================================
   SECTION 6: SAVED PAGE
   Only activates when #savedGrid is found in the DOM.
   Reads hackathons from localStorage and renders them.
   ============================================================== */
const savedGrid    = document.getElementById('savedGrid');
const emptyState   = document.getElementById('emptyState');

if (savedGrid) {
  renderSavedPage();
}

/**
 * Reads localStorage, renders saved hackathon cards.
 * Called once on load and again after each removal.
 */
function renderSavedPage() {
  if (!savedGrid) return;

  /* Clear existing cards */
  savedGrid.querySelectorAll('.card').forEach(c => c.remove());

  const saved = getSavedList();

  /* Show / hide empty state */
  if (emptyState) {
    emptyState.style.display = saved.length === 0 ? 'block' : 'none';
  }

  if (saved.length === 0) return;

  const html = saved.map(hack => {
    const key = slugify(hack.name);
    return `
      <div class="card" data-key="${key}">
        <div class="card-top-row">
          <span class="card-platform">${hack.platform}</span>
          <span class="card-prize">🏆 ${hack.prize}</span>
        </div>
        <h3 class="card-title">${hack.name}</h3>
        <p class="card-date">📅 ${hack.date}</p>
        <p class="card-desc">${hack.description}</p>
        <div class="card-tags">
          ${hack.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
        <div class="card-actions">
          <a href="${hack.registerLink}" target="_blank" rel="noopener noreferrer"
             class="btn btn--primary card-btn">Register Now →</a>
          <button class="btn btn--danger btn-remove" data-key="${key}">
            🗑 Remove
          </button>
        </div>
      </div>
    `;
  }).join('');

  savedGrid.insertAdjacentHTML('beforeend', html);
}

/* Remove button listener on saved page (event delegation) */
if (savedGrid) {
  savedGrid.addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove');
    if (!btn) return;

    const key  = btn.dataset.key;
    let saved  = getSavedList();
    saved      = saved.filter(h => slugify(h.name) !== key);
    setSavedList(saved);

    /* Re-render and update badge */
    renderSavedPage();
    updateBadge();
  });
}


/* ==============================================================
   SECTION 7: NOTIFY ME FORM (index.html)
   Uses EmailJS to send a confirmation email.
   ============================================================== */
const notifyForm  = document.getElementById('notifyForm');
const notifyInput = document.getElementById('notifyInput');
const notifyMsg   = document.getElementById('notifyMsg');

if (notifyForm) {
  /* Initialize EmailJS with your public key */
  emailjs.init(EMAILJS_PUBLIC_KEY);

  notifyForm.addEventListener('submit', e => {
    e.preventDefault(); /* prevent page refresh */

    const email = notifyInput.value.trim();
    if (!email) return;

    /* Basic email format validation */
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showNotifyMsg('Please enter a valid email address.', 'error');
      return;
    }

    /* Disable button while sending */
    const submitBtn = notifyForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    /* Send via EmailJS — uses the template variables you set up */
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      user_email: email,
      to_name:    email.split('@')[0] /* friendly first-name from email */
    })
    .then(() => {
      showNotifyMsg("You're on the list! We'll notify you of new opportunities. 🎉", 'success');
      notifyInput.value = ''; /* clear the input */
    })
    .catch(err => {
      showNotifyMsg('Something went wrong. Please try again later.', 'error');
      console.error('EmailJS error:', err);
    })
    .finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Notify Me';
    });
  });
}

/**
 * Shows a message below the notify form.
 * @param {string} text    - message to display
 * @param {string} type    - 'success' or 'error'
 */
function showNotifyMsg(text, type) {
  if (!notifyMsg) return;
  notifyMsg.textContent = text;
  notifyMsg.className   = `notify-msg ${type}`;
}


/* ==============================================================
   UTILITIES
   ============================================================== */

/**
 * Converts a hackathon name to a simple lowercase slug key.
 * Used to identify hackathons in localStorage.
 * e.g. "HackMIT 2026" → "hackmit-2026"
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Formats large numbers with K suffix for readability.
 * e.g. 220000 → "220K"
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/* ==============================================================
   SECTION 8: DYNAMIC FOOTER YEAR
   Updates the year in footer automatically every year.
   ============================================================== */
document.querySelectorAll('.footer-bottom p').forEach(el => {
  el.innerHTML = el.innerHTML.replace(
    '2026',
    new Date().getFullYear()
  );
});
