/*
  Muc dich:
  - Chay trong DevTools Console tren site So tay cu dang hoat dong
  - Khong sua repo/site cu
  - Tai ve 1 file JSON chua treeData de dua sang repo moi

  Cach dung:
  1. Mo https://tcddvhn.id.vn
  2. Dang nhap neu can de noi dung da nap day du
  3. Mo F12 -> Console
  4. Paste toan bo file nay va Enter
*/

(() => {
  const candidate =
    (typeof window !== 'undefined' && Array.isArray(window.APP_DATA) && window.APP_DATA)
    || (typeof APP_DATA !== 'undefined' && Array.isArray(APP_DATA) && APP_DATA)
    || null;

  if (!candidate) {
    alert('Khong tim thay APP_DATA/treeData tren trang hien tai. Hay doi trang tai xong noi dung So tay roi thu lai.');
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    source: window.location.href,
    treeData: candidate,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `handbook-treeData-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  console.log('Da xuat treeData JSON thanh cong.', {
    rootNodes: candidate.length,
    fileName: anchor.download,
  });
})();
