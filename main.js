const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const GIFEncoder = require("gifencoder");
const { createCanvas, loadImage } = require("canvas");

// Handle PNG export
ipcMain.handle("export-spritesheet", async (event, { buffer, format, outputPath }) => {
  if (format === "png") {
    const imagePaths = buffer;
    const images = await Promise.all(imagePaths.map(loadImage));

    const frameWidth = images[0].width;
    const frameHeight = images[0].height;
    const columns = Math.ceil(Math.sqrt(images.length));
    const rows = Math.ceil(images.length / columns);

    const canvas = createCanvas(frameWidth * columns, frameHeight * rows);
    const ctx = canvas.getContext("2d");

    images.forEach((img, i) => {
      const x = (i % columns) * frameWidth;
      const y = Math.floor(i / columns) * frameHeight;
      ctx.drawImage(img, x, y);
    });

    const outPath = path.join(outputPath, `spritesheet_${Date.now()}.png`);
    const out = fs.createWriteStream(outPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    return new Promise((resolve) => out.on("finish", resolve));
  }

  if (format === "gif") {
    const imagePaths = buffer;
    const images = await Promise.all(imagePaths.map(loadImage));
    const width = images[0].width;
    const height = images[0].height;

    const encoder = new GIFEncoder(width, height);
    const gifPath = path.join(outputPath, `spritesheet_${Date.now()}.gif`);
    const gifStream = fs.createWriteStream(gifPath);

    encoder.createReadStream().pipe(gifStream);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(100);
    encoder.setQuality(10);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    images.forEach((img) => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      encoder.addFrame(ctx);
    });

    encoder.finish();
    return new Promise((resolve) => gifStream.on("finish", resolve));
  }
});
