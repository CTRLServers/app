const Utils = {
  escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  formatbytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
  },

  formatmb(mb) {
    if (!mb) return '0 MB';
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb + ' MB';
  },

  formatuptime(ms) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  statuslabel(state) {
    const map = {
      running: 'Running',
      starting: 'Starting',
      stopping: 'Stopping',
      offline: 'Offline'
    };
    return map[state] || state || 'Unknown';
  },

  el(id) {
    return document.getElementById(id);
  },

  ansitohtml(str) {
    if (typeof str !== 'string') return '';
    str = str.replace(/\r/g, '');

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const colors = ['#1a1a1b', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5'];
    const bright = ['#666666', '#f14c4c', '#23d981', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff'];

    let result = '';
    let i = 0;
    let openspans = 0;
    while (i < str.length) {
      if (str[i] === '\x1b' && str[i + 1] === '[') {
        let j = i + 2;
        while (j < str.length && str[j] >= '0' && str[j] <= '?') j++;
        if (j < str.length && str[j] >= '@' && str[j] <= '~') {
          const raw = str.substring(i + 2, j);
          const params = raw.split(';').map(Number);
          const cmd = str[j];
          i = j + 1;
          if (cmd === 'm') {
            if (params.length === 0 || params.includes(0)) {
              while (openspans > 0) { result += '</span>'; openspans--; }
            } else {
              for (const code of params) {
                if (code === 1) { result += '<span style="font-weight:bold">'; openspans++; }
                else if (code === 3) { result += '<span style="font-style:italic">'; openspans++; }
                else if (code === 4) { result += '<span style="text-decoration:underline">'; openspans++; }
                else if (code >= 30 && code <= 37) { result += `<span style="color:${colors[code - 30]}">`; openspans++; }
                else if (code >= 90 && code <= 97) { result += `<span style="color:${bright[code - 90]}">`; openspans++; }
                else if (code >= 40 && code <= 47) { result += `<span style="background-color:${colors[code - 40]}">`; openspans++; }
              }
            }
          }
          continue;
        }
      }
      if (str[i] === '\x1b') {
        i++;
        continue;
      }
      result += esc(str[i]);
      i++;
    }
    while (openspans > 0) { result += '</span>'; openspans--; }
    return result;
  }
};
