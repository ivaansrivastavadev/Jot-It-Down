    // Add select text button to nav
    document.querySelector('nav').appendChild(document.getElementById('selectTextBtn'));

    // Show popup with all editor text
    document.getElementById('selectTextBtn').onclick = function() {
      document.getElementById('editorTextDump').value = buffer.join('\n');
      document.getElementById('selectTextPopup').style.display = 'block';
      document.getElementById('editorTextDump').focus();
      document.getElementById('editorTextDump').select();
    };
    document.getElementById('closeSelectTextPopup').onclick = function() {
      document.getElementById('selectTextPopup').style.display = 'none';
    };

    // Open file button logic
    document.getElementById('openFileBtn').onclick = () => {
      document.getElementById('folderIcon').click();
    };

    // Download code button
    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'downloadBtn';
    downloadBtn.title = 'Download Code';
    downloadBtn.style = 'background:none;border:none;color:#fff;font-size:20px;cursor:pointer;margin:0 10px;';
    downloadBtn.textContent = '⬇️';
    document.querySelector('nav').appendChild(downloadBtn);

    downloadBtn.onclick = () => {
      let filename = prompt('Enter filename to download:', 'code.txt');
      if (!filename) return;
      const blob = new Blob([buffer.join('\n')], {type: 'text/plain'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 100);
    };

    document.getElementById('folderIcon').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const txt = await file.text();
      buffer = txt.split('\n');
      cx = cy = 0;
      autoSave();
    };

    // Show keyboard button logic
    document.getElementById('showKeyboardBtn').onclick = () => {
      showMobileKeyboard();
    };

    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d');
    let cw = 12, ch = 18;
    let buffer = [""];
    let cx = 0, cy = 0;
    let selecting = false;
    let fh;

    // Visual cursor and offsets for smooth animation
    let visualCursorX = 0;
    let visualCursorY = 0;
    let visualOffsetX = 0;
    let visualOffsetY = 0;

    // Glow settings
    let glowBlur = 8;
    let glowColor = '#00f0ff';

    function resize() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    }
    window.onresize = resize;
    resize();

    window.addEventListener('keydown', e => {
      const cmdPalette = document.getElementById('cmdPalette');

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        autoSave();
        return;
      }
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        triggerOpen();
        return;
      }

      // Folder icon for file picker
      if (!document.getElementById('folderIcon')) {
        const icon = document.createElement('input');
        icon.type = 'file';
        icon.id = 'folderIcon';
        icon.style.display = 'none';
        icon.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const txt = await file.text();
          buffer = txt.split('\n');
          cx = cy = 0;
        });
        document.body.appendChild(icon);
      }
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      // Show file picker with floating folder icon
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        document.getElementById('folderIcon').click();
        return;
      }
      // Show settings modal
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        toggleSettings();
        return;
      }
      // Show mobile keyboard
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        showMobileKeyboard();
        return;
      }
      if (cmdPalette && cmdPalette.style.display === 'block') return;

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        insertChar(e.key);
      } else if (e.key === 'Backspace') {
        deleteChar();
      } else if (e.key === 'Enter') {
        const line = buffer[cy];
        buffer.splice(cy + 1, 0, line.slice(cx));
        buffer[cy] = line.slice(0, cx);
        cy++; cx = 0;
      } else if (e.key === 'ArrowLeft') {
        if (cx > 0) cx--;
        else if (cy > 0) {
          cy--;
          cx = buffer[cy].length;
        }
      } else if (e.key === 'ArrowRight') {
        if (cx < buffer[cy].length) cx++;
        else if (cy < buffer.length - 1) {
          cy++;
          cx = 0;
        }
      } else if (e.key === 'ArrowUp') {
        if (cy > 0) {
          cy--;
          cx = Math.min(cx, buffer[cy].length);
        }
      } else if (e.key === 'ArrowDown') {
        if (cy < buffer.length - 1) {
          cy++;
          cx = Math.min(cx, buffer[cy].length);
        }
      }
      e.preventDefault();
      autoSave();
    });

    function insertChar(ch) {
      buffer[cy] = buffer[cy].slice(0, cx) + ch + buffer[cy].slice(cx);
      cx++;
    }

    function deleteChar() {
      if (cx > 0) {
        buffer[cy] = buffer[cy].slice(0, cx - 1) + buffer[cy].slice(cx);
        cx--;
      } else if (cy > 0) {
        const prevLine = buffer[cy - 1];
        cx = prevLine.length;
        buffer[cy - 1] += buffer[cy];
        buffer.splice(cy, 1);
        cy--;
      }
    }

    function selectAll() {
      cy = 0;
      cx = 0;
      selecting = true;
    }

    window.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i === 0) {
          buffer[cy] = buffer[cy].slice(0, cx) + lines[i] + buffer[cy].slice(cx);
          cx += lines[i].length;
        } else {
          const nextPart = buffer[cy].slice(cx);
          buffer[cy] = buffer[cy].slice(0, cx);
          buffer.splice(cy + 1, 0, lines[i] + nextPart);
          cy++;
          cx = lines[i].length;
        }
      }
      autoSave();
    });

    function toggleCommandPalette() {
      const palette = document.getElementById('cmdPalette');
      if (!palette) return;
      if (palette.style.display === 'block') {
        palette.style.display = 'none';
      } else {
        palette.style.display = 'block';
        palette.querySelector('input').value = '';
        palette.querySelector('input').focus();
      }
    }

    async function triggerOpen() {
      [fh] = await window.showOpenFilePicker();
      const file = await fh.getFile();
      const txt = await file.text();
      buffer = txt.split('\n');
      cx = cy = 0;
    }

    async function autoSave() {
      if (!fh) return;
      const w = await fh.createWritable();
      await w.write(buffer.join('\n'));
      await w.close();
    }

    // Add glow effect to text rendering
    function drawTextWithGlow(ctx, text, x, y, color = '#fff', glowColor = '#fff', glowBlur = 8) {
      ctx.save();
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = glowBlur;
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    // Add glow settings to settings modal if not present
    function addGlowSettings() {
      const settings = document.getElementById('settingsModal');
      if (!settings || document.getElementById('glowBlurSlider')) return;

      const glowDiv = document.createElement('div');
      glowDiv.style.marginTop = '1em';

      // Blur slider
      const blurLabel = document.createElement('label');
      blurLabel.textContent = 'Glow Blur: ';
      const blurSlider = document.createElement('input');
      blurSlider.type = 'range';
      blurSlider.min = 0;
      blurSlider.max = 32;
      blurSlider.value = glowBlur;
      blurSlider.id = 'glowBlurSlider';
      blurSlider.style.verticalAlign = 'middle';
      const blurValue = document.createElement('span');
      blurValue.textContent = glowBlur;
      blurSlider.oninput = function() {
        glowBlur = parseInt(this.value, 10);
        blurValue.textContent = glowBlur;
      };

      blurLabel.appendChild(blurSlider);
      blurLabel.appendChild(blurValue);
      glowDiv.appendChild(blurLabel);

      // Color picker
      const colorLabel = document.createElement('label');
      colorLabel.textContent = ' Glow Color: ';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = glowColor;
      colorInput.id = 'glowColorInput';
      colorInput.oninput = function() {
        glowColor = this.value;
      };
      colorLabel.appendChild(colorInput);
      glowDiv.appendChild(colorLabel);

      settings.appendChild(glowDiv);
    }

    // Patch toggleSettings to add glow settings
    const origToggleSettings = window.toggleSettings;
    window.toggleSettings = function() {
      origToggleSettings && origToggleSettings();
      addGlowSettings();
    };

    function draw() {
      requestAnimationFrame(draw);

      ctx.font = `${ch}px monospace`;
      ctx.textBaseline = "top";

      const beforeCursor = buffer[cy].slice(0, cx);
      const cursorXRaw = ctx.measureText(beforeCursor).width;

      const lineHeight = ch;
      const gutterWidth = 40;
      const visibleLines = Math.floor(cv.height / lineHeight);
      const scrollStart = Math.max(0, cy - Math.floor(visibleLines / 2));
      const offsetYTarget = (cv.height / 2) - (cy - scrollStart) * lineHeight;
      const offsetXTarget = (cv.width / 2) - cursorXRaw;

      const cursorXTarget = visualOffsetX + cursorXRaw;
      const cursorYTarget = visualOffsetY + (cy - scrollStart) * lineHeight;

      const ease = 0.2;
      visualCursorX += (cursorXTarget - visualCursorX) * ease;
      visualCursorY += (cursorYTarget - visualCursorY) * ease;
      visualOffsetX += (offsetXTarget - visualOffsetX) * ease;
      visualOffsetY += (offsetYTarget - visualOffsetY) * ease;

      ctx.fillStyle = '#1a1b22';
      ctx.fillRect(0, 0, cv.width, cv.height);

      for (let y = 0; y < buffer.length; y++) {
        const lineY = visualOffsetY + (y - scrollStart) * lineHeight;
        if (lineY < -lineHeight || lineY > cv.height) continue;

        // Glow for line numbers
        drawTextWithGlow(ctx, (y + 1).toString().padStart(3, ' '), visualOffsetX - gutterWidth + 5, lineY, '#444', glowColor, 6);

        // Glow for code text
        drawTextWithGlow(ctx, buffer[y], visualOffsetX, lineY, selecting ? '#0f0' : '#ddd', glowColor, glowBlur);
      }

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(visualCursorX, visualCursorY, 2, lineHeight);
      ctx.restore();

      selecting = false;
    }

    draw();

    // Ensure the keyboard button works on mobile by focusing an input or showing a keyboard popup
    document.getElementById('showKeyboardBtn').addEventListener('click', function() {
      // Try to focus the command palette input to trigger the keyboard
      var cmdInput = document.querySelector('#cmdPalette input');
      if (cmdInput) {
        cmdInput.focus();
      }
    });
    /* Patch drawTextWithGlow to not use glow for line numbers */
    const origDrawTextWithGlow = drawTextWithGlow;
    drawTextWithGlow = function(ctx, text, x, y, color = '#fff', glowColor = '#fff', glowBlur = 8, noGlow = false) {
      if (noGlow) {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.restore();
      } else {
        origDrawTextWithGlow(ctx, text, x, y, color, glowColor, glowBlur);
      }
    };

    /* Patch draw to use noGlow for line numbers */
    const origDraw = draw;
    draw = function() {
      requestAnimationFrame(draw);

      ctx.font = `${ch}px monospace`;
      ctx.textBaseline = "top";

      const beforeCursor = buffer[cy].slice(0, cx);
      const cursorXRaw = ctx.measureText(beforeCursor).width;

      const lineHeight = ch;
      const gutterWidth = 40;
      const visibleLines = Math.floor(cv.height / lineHeight);
      const scrollStart = Math.max(0, cy - Math.floor(visibleLines / 2));
      const offsetYTarget = (cv.height / 2) - (cy - scrollStart) * lineHeight;
      const offsetXTarget = (cv.width / 2) - cursorXRaw;

      const cursorXTarget = visualOffsetX + cursorXRaw;
      const cursorYTarget = visualOffsetY + (cy - scrollStart) * lineHeight;

      const ease = 0.2;
      visualCursorX += (cursorXTarget - visualCursorX) * ease;
      visualCursorY += (cursorYTarget - visualCursorY) * ease;
      visualOffsetX += (offsetXTarget - visualOffsetX) * ease;
      visualOffsetY += (offsetYTarget - visualOffsetY) * ease;

      ctx.fillStyle = '#1a1b22';
      ctx.fillRect(0, 0, cv.width, cv.height);

      for (let y = 0; y < buffer.length; y++) {
        const lineY = visualOffsetY + (y - scrollStart) * lineHeight;
        if (lineY < -lineHeight || lineY > cv.height) continue;

        // No glow for line numbers
        drawTextWithGlow(ctx, (y + 1).toString().padStart(3, ' '), visualOffsetX - gutterWidth + 5, lineY, '#444', glowColor, 6, true);

        // Glow for code text
        drawTextWithGlow(ctx, buffer[y], visualOffsetX, lineY, selecting ? '#0f0' : '#ddd', glowColor, glowBlur);
      }

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(visualCursorX, visualCursorY, 2, lineHeight);
      ctx.restore();

      selecting = false;
    };
    draw();