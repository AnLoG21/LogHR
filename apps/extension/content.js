function detectBoard() {
  const h = location.hostname;
  if (h.includes('hh.ru')) return 'HH';
  if (h.includes('superjob.ru')) return 'SUPERJOB';
  if (h.includes('avito.ru')) return 'AVITO';
  if (h.includes('zarplata.ru')) return 'ZARPLATA';
  return 'MANUAL';
}

function textOf(sel) {
  return document.querySelector(sel)?.textContent?.trim() || '';
}

function parseHH() {
  const name =
    textOf('[data-qa="resume-personal-name"]') ||
    textOf('h1') ||
    '';
  const parts = name.split(/\s+/);
  return {
    lastName: parts[0] || 'Кандидат',
    firstName: parts[1] || 'HH',
    middleName: parts[2],
    phone: textOf('[data-qa="resume-contact-phone"]') || document.querySelector('a[href^="tel:"]')?.textContent?.trim() || '',
    email: textOf('[data-qa="resume-contact-email"]') || document.querySelector('a[href^="mailto:"]')?.textContent?.trim() || '',
    about: textOf('[data-qa="resume-block-skills-content"]') || document.body.innerText.slice(0, 4000),
    source: 'HH',
  };
}

function parseSuperJob() {
  const name = textOf('h1') || textOf('[class*="ResumeHeader"]') || '';
  const parts = name.split(/\s+/);
  return {
    lastName: parts[0] || 'Кандидат',
    firstName: parts[1] || 'SJ',
    middleName: parts[2],
    phone: document.querySelector('a[href^="tel:"]')?.textContent?.trim() || '',
    email: document.querySelector('a[href^="mailto:"]')?.textContent?.trim() || '',
    about: document.body.innerText.slice(0, 4000),
    source: 'SUPERJOB',
  };
}

function parseAvito() {
  const name = textOf('h1') || textOf('[data-marker="item-view/title-info"]') || 'Кандидат Avito';
  const parts = name.split(/\s+/);
  return {
    lastName: parts[0] || 'Кандидат',
    firstName: parts[1] || 'Avito',
    middleName: parts[2],
    phone: document.querySelector('a[href^="tel:"]')?.textContent?.trim() || '',
    email: '',
    about: document.body.innerText.slice(0, 4000),
    source: 'AVITO',
  };
}

function parseZarplata() {
  const name = textOf('h1') || '';
  const parts = name.split(/\s+/);
  return {
    lastName: parts[0] || 'Кандидат',
    firstName: parts[1] || 'ZP',
    middleName: parts[2],
    phone: document.querySelector('a[href^="tel:"]')?.textContent?.trim() || '',
    email: document.querySelector('a[href^="mailto:"]')?.textContent?.trim() || '',
    about: document.body.innerText.slice(0, 4000),
    source: 'ZARPLATA',
  };
}

function parseResume() {
  const board = detectBoard();
  let base;
  if (board === 'HH') base = parseHH();
  else if (board === 'SUPERJOB') base = parseSuperJob();
  else if (board === 'AVITO') base = parseAvito();
  else if (board === 'ZARPLATA') base = parseZarplata();
  else base = { lastName: 'Кандидат', firstName: 'Web', about: document.body.innerText.slice(0, 2000), source: 'MANUAL' };

  return {
    ...base,
    addType: 'SEARCH',
    resumeUrl: location.href,
    forceDuplicate: true,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PARSE_RESUME') {
    try {
      sendResponse({ ok: true, data: parseResume(), board: detectBoard() });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  }
  return true;
});
