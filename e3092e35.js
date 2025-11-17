const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 13000;

app.use(cors());
app.use(express.json());
app.set("trust proxy", true);

// ============ IP 지역 정보 로더 ============

/**
 * IPv4 주소를 정수로 변환
 * @param {string} ip - IPv4 주소 (예: "1.0.0.0")
 * @returns {number} 정수 값
 */
function ipToInt(ip) {
  const parts = ip.split(".");
  return (
    (parseInt(parts[0]) << 24) +
    (parseInt(parts[1]) << 16) +
    (parseInt(parts[2]) << 8) +
    parseInt(parts[3])
  );
}

/**
 * 정수를 IPv4 주소로 변환
 * @param {number} num - 정수 값
 * @returns {string} IPv4 주소
 */
function intToIp(num) {
  return (
    ((num >>> 24) & 255) +
    "." +
    ((num >>> 16) & 255) +
    "." +
    ((num >>> 8) & 255) +
    "." +
    (num & 255)
  );
}

/**
 * 로그2 계산
 */
function log2(n) {
  return Math.log(n) / Math.log(2);
}

/**
 * APNIC 파일 파싱 및 IP 범위 데이터 구축
 */
function loadIPGeoDatabase(filePath) {
  const ipRanges = [];

  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split("\n");

    for (const line of lines) {
      // 주석 라인 스킵
      if (!line.startsWith("apnic|") || line.startsWith("#")) {
        continue;
      }

      const parts = line.split("|");

      // 필수 필드 확인
      if (parts.length < 5 || parts[2] !== "ipv4") {
        continue;
      }

      const country = parts[1];
      const startIP = parts[3];
      const prefixSize = parseInt(parts[4]);

      if (!country || !startIP || !prefixSize || country === "*") {
        continue;
      }

      // IP 범위 계산
      const startInt = ipToInt(startIP);
      const endInt = startInt + prefixSize - 1;

      ipRanges.push({
        country,
        startInt,
        endInt,
        startIP,
        prefixSize,
      });
    }

    // 시작 IP로 정렬 (이진 탐색을 위해)
    ipRanges.sort((a, b) => a.startInt - b.startInt);

    console.log(`✓ IP 지역 정보 로드 완료: ${ipRanges.length}개 범위`);
    return ipRanges;
  } catch (error) {
    console.error("IP 지역 정보 로드 실패:", error.message);
    return [];
  }
}

/**
 * IP 주소로 국가 조회 (이진 탐색)
 */
function getCountryByIP(ip, ipRanges) {
  const ipInt = ipToInt(ip);

  // 이진 탐색
  let left = 0;
  let right = ipRanges.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const range = ipRanges[mid];

    if (ipInt >= range.startInt && ipInt <= range.endInt) {
      return range.country;
    }

    if (ipInt < range.startInt) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return "Unknown";
}

// 데이터베이스 로드
const dbFilePath = path.join(__dirname, "delegated-apnic-extended-latest");
const ipRanges = loadIPGeoDatabase(dbFilePath);

// ============ Express 라우트 ============

/**
 * 응답 시간 측정 미들웨어
 */
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

/**
 * POST 요청 처리
 */
app.post("/", (req, res) => {
  const clientIP = req.ip;
  const country = getCountryByIP(clientIP, ipRanges);
  const responseTime = Date.now() - req.startTime;
  const message = req.body.message;

  console.log(
    `[POST] IP: ${clientIP} | 국가: ${country} | 응답시간: ${responseTime}ms`
  );

  res.json({
    echo: message,
    ip: clientIP,
    country: country,
    responseTime: `${responseTime}ms`,
  });
});

/**
 * GET 요청 처리
 */
app.get("/", (req, res) => {
  const clientIP = req.ip;
  const country = getCountryByIP(clientIP, ipRanges);
  const responseTime = Date.now() - req.startTime;
  const message = req.query.message;

  console.log(
    `[GET] IP: ${clientIP} | 국가: ${country} | 응답시간: ${responseTime}ms`
  );

  res.json({
    echo: message,
    ip: clientIP,
    country: country,
    responseTime: `${responseTime}ms`,
  });
});

/**
 * IP 조회 전용 엔드포인트
 */
app.get("/ip-info/:ip", (req, res) => {
  const targetIP = req.params.ip;
  const country = getCountryByIP(targetIP, ipRanges);
  const responseTime = Date.now() - req.startTime;

  console.log(
    `[IP-INFO] 조회IP: ${targetIP} | 국가: ${country} | 응답시간: ${responseTime}ms`
  );

  res.json({
    query: targetIP,
    country: country,
    responseTime: `${responseTime}ms`,
  });
});

/**
 * 상태 확인 엔드포인트
 */
app.get("/status", (req, res) => {
  res.json({
    status: "running",
    port: port,
    ipRangesLoaded: ipRanges.length,
  });
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
  console.log(`엔드포인트:`);
  console.log(`  POST / - 클라이언트 IP 및 국가 정보 반환`);
  console.log(`  GET / - 쿼리 파라미터로 메시지 전송`);
  console.log(`  GET /ip-info/:ip - 특정 IP의 국가 정보 조회`);
  console.log(`  GET /status - 서버 상태 확인`);
});
