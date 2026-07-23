const fs = require('fs');
const http = require('http');

// We don't have an image parser, but we can write a tiny HTML file that loads the image into a canvas,
// reads the pixel data, and prints the bounding box to the console.
const html = `
<!DOCTYPE html>
<html>
<body>
<canvas id="c"></canvas>
<script>
  const img = new Image();
  img.src = 'public/assets/mage_hat.png';
  img.onload = () => {
    const c = document.getElementById('c');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const alpha = data[(y * img.width + x) * 4 + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    console.log(JSON.stringify({ width: img.width, height: img.height, minX, minY, maxX, maxY }));
  };
</script>
</body>
</html>
`;

fs.writeFileSync('measure.html', html);
console.log('measure.html created');
