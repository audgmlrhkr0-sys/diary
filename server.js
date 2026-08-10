const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'docs')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`감상평 다이어리: http://localhost:${PORT}`);
  console.log(`같은 Wi-Fi에서 휴대폰 접속: http://<내 IP>:${PORT}`);
});
