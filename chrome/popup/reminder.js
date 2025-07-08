// Reads the latest dhikr from storage and displays it
async function loadDhikr() {
  try {
    const { currentDhikr } = await chrome.storage.local.get('currentDhikr');
    if (currentDhikr) {
      updateUI(currentDhikr);
    }
  } catch (err) {
    console.error('Reminder popup: Failed to load dhikr', err);
  }
}

function updateUI(dhikr) {
  document.getElementById('arabic').textContent = dhikr.arabic || '';
  document.getElementById('translit').textContent = dhikr.transliteration || '';
  document.getElementById('english').textContent = dhikr.english || '';
  document.getElementById('reward').textContent = dhikr.reward ? `Reward: ${dhikr.reward}` : '';
}

document.getElementById('close-btn').addEventListener('click', () => window.close());

// Initially populate once DOM ready
window.addEventListener('DOMContentLoaded', loadDhikr); 