// 🌊 The Great Lake Bot — Frontend Bridge

function doLogin() {
  const name = document.getElementById('name').value;
  const passphrase = document.getElementById('passphrase').value;

  fetch('/onboarding/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, passphrase })
  })
    .then(res => res.json())
    .then(data => {
      console.log('Login success:', data);
      localStorage.setItem('userName', name);
      localStorage.setItem('currentMood', 'calm');
      window.location.href = '/dashboard';
    })
    .catch(err => console.error('Login failed:', err));
}

function setMood(mood) {
  localStorage.setItem('currentMood', mood);
  document.dispatchEvent(new Event('storage'));
}
