const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.post("/", (req, res) => {
  const clientIP = req.ip;
  console.log(`클라이언트 IP 주소: ${clientIP}`);
  const message = req.body.message;
  res.json({ echo: message, ip: clientIP });
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
