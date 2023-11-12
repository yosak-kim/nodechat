const webSocket = require('ws');

module.exports = (server) => {
  const wss = new webSocket.Server({ server });

  wss.on('connection', (ws, req) => { //웹소켓 연결. 웹소켓 서버 객체를 만들어 주고 on 메소드로 연결한다. 이 아래로도 on으로 이벤트리스너를 죽 붙인다.
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress; //클라이언트의 ip를 알아내는 유명한 방법이니 암기! express에서는 proxy-addr 패키지를 사용하는데 이것을 사용해도 괜찮음.
    console.log('새로운 클라이언트 접속', ip);
    ws.on('message', (message) => { // 클라이언트로부터 메시지 수신 시
      console.log(message.toString());
    });
    ws.on('error', (error) => { // error
      console.error(error);
    });
    ws.on('close', () => { // close connection
      console.log('클라이언트 접속 해제', ip);
      clearInterval(ws.interval); // 종료할 때 clearInterval로 setInterval을 정리해주지 않으면 메모리 누수가 발생함.
    });

    ws.interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) { //readystate 는 CONNECTING, OPEN, CLOSING, CLOSED 4가지 상태가 존재함. OPEN일 때만 에러없이 메시지를 보낼 수 있음.
        ws.send('서버에서 클라이언트로 메시지를 보냅니다.');
      }
    }, 3000);
  });
};