function parseResume() {
  const name =
    document.querySelector('[data-qa="resume-personal-name"]')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    '';
  const parts = name.split(/\s+/);
  const phone =
    document.querySelector('[data-qa="resume-contact-phone"]')?.textContent?.trim() ||
    document.querySelector('a[href^="tel:"]')?.textContent?.trim() ||
    '';
  const email =
    document.querySelector('[data-qa="resume-contact-email"]')?.textContent?.trim() ||
    document.querySelector('a[href^="mailto:"]')?.textContent?.trim() ||
    '';
  const about =
    document.querySelector('[data-qa="resume-block-skills-content"]')?.textContent?.trim() ||
    document.body.innerText.slice(0, 4000);
  return {
    lastName: parts[0] || 'Кандидат',
    firstName: parts[1] || 'HH',
    middleName: parts[2],
    phone,
    email,
    about,
    source: 'HH',
    addType: 'SEARCH',
    resumeUrl: location.href,
    forceDuplicate: true,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PARSE_RESUME') {
    sendResponse({ ok: true, data: parseResume() });
  }
  return true;
});
