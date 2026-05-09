// 🌊 Great Lake Frontend Bridge
const API_BASE = window.location.origin;

// Send a wave (message) to the backend
async function sendWave(message) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  const data = await res.json();
  console.log('Reflection:', data.reflection);
  return data.reflection;
}

// Example: send a test wave when the page loads
window.addEventListener('DOMContentLoaded', () => {
  sendWave('Hello from the lake!');
});
