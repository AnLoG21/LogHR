const msg = document.getElementById('msg');
const apiInput = document.getElementById('api');
const tokenInput = document.getElementById('token');

chrome.storage.local.get(['api', 'token'], (data) => {
  if (data.api) apiInput.value = data.api;
  if (data.token) tokenInput.value = data.token;
});

document.getElementById('go').onclick = async () => {
  const api = apiInput.value.replace(/\/$/, '');
  const token = tokenInput.value.trim();
  chrome.storage.local.set({ api, token });
  msg.textContent = 'Читаем страницу…';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: 'PARSE_RESUME' }, async (res) => {
    if (!res?.ok) {
      msg.textContent = 'Откройте страницу резюме HH.ru';
      return;
    }
    try {
      const r = await fetch(`${api}/api/candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(res.data),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      msg.textContent = data.id ? `Создан: ${data.lastName} ${data.firstName}` : 'Импорт выполнен';
    } catch (e) {
      msg.textContent = `Ошибка: ${e.message}`;
    }
  });
};
