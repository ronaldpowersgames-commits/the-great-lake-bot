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
      window.location.href = '/dashboard'; // or wherever you want to redirect
    })
    .catch(err => console.error('Login failed:', err));
}
