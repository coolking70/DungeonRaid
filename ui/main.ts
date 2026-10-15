// Default public entry; debug retains all P2 controls on the shared session controller.
if (new URLSearchParams(location.search).has('debug')) await import('./debug');
else (await import('./app')).mountApp().catch(error => {
  console.error(error);
  document.body.textContent = `Unable to start Dungeon Raid: ${String(error)}`;
});
export {};
