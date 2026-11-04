'use strict';
(() => {
  const picture = document.querySelector('#profile-picture');
  const fileInput = document.querySelector('#picture-file');
  const remove = document.querySelector('#remove-picture');
  const pictureStatus = document.querySelector('#picture-status');
  let saving = false;
  function showPicture(image) {
    if (image) picture.src = image;
    else picture.removeAttribute('src');
    picture.hidden = !image;
    document.querySelector('#picture-placeholder').hidden = Boolean(image);
    remove.disabled = !image;
  }
  async function loadPicture() {
    try { showPicture((await gymApi('/profile/picture')).image); }
    catch (error) { pictureStatus.textContent = error.message; }
  }
  async function savePicture(file) {
    if (saving) return;
    saving = true; fileInput.disabled = true; remove.disabled = true;
    pictureStatus.textContent = 'Saving picture…';
    try {
      let image = null;
      if (file) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
          throw new Error('Choose a PNG, JPEG, or WebP picture up to 5 MB.');
        }
        const bitmap = await createImageBitmap(file);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 256;
          const size = Math.min(bitmap.width, bitmap.height);
          canvas.getContext('2d').drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 256, 256);
          image = canvas.toDataURL('image/png');
        } finally { bitmap.close(); }
      }
      const result = await gymApi('/profile/picture', { method: 'PUT', body: JSON.stringify({ image }) });
      showPicture(result.image);
      pictureStatus.textContent = result.image ? 'Profile picture saved.' : 'Profile picture removed.';
    } catch (error) {
      pictureStatus.textContent = `Could not save picture. ${error.message}`;
      remove.disabled = picture.hidden;
    } finally {
      saving = false; fileInput.disabled = false; fileInput.value = '';
    }
  }
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) savePicture(fileInput.files[0]); });
  remove.addEventListener('click', () => savePicture(null));
  window.addEventListener('pageshow', loadPicture);

  const button = document.querySelector('#delete-account');
  const dialog = document.querySelector('#delete-account-dialog');
  const form = document.querySelector('#delete-account-form');
  const status = document.querySelector('#delete-account-status');
  let deleting = false;
  button.addEventListener('click', () => { form.reset(); status.textContent = ''; dialog.showModal(); });
  document.querySelector('#cancel-delete-account').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { form.reset(); button.focus(); });
  dialog.addEventListener('cancel', event => { if (deleting) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (deleting || !form.reportValidity()) return;
    deleting = true;
    form.querySelectorAll('input, button').forEach(control => { control.disabled = true; });
    status.textContent = 'Deleting account…';
    try {
      await gymApi('/account', { method: 'DELETE', body: JSON.stringify({
        password: document.querySelector('#delete-password').value,
        confirmation: document.querySelector('#delete-confirmation').value
      }) });
      location.replace('login.html');
    } catch (error) { status.textContent = error.message; }
    finally {
      deleting = false;
      form.querySelectorAll('input, button').forEach(control => { control.disabled = false; });
    }
  });
})();
