// Entry point. The game boots from here once the foundation task lands.
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (ctx) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
