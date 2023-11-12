const SocketIO = require('socket.io');

module.exports = (server) => {
  const io = SocketIO(server, { path: '/socket.io' }); // 두 번째 인수인 옵션객체에서 다양한 설정을 지원한다. 여기서는 path만 사용. 클라이언트에서도 저 경로와 일치하는 path를 넣어야 작동함.

/**여기서부터는 io와 socket객체가 Socket.io의 핵심 */

  io.on('connection', (socket) => {//웹 소켓 연결 시
    const req = socket.request; //request 속성으로 요청 객체에 접근. 응답 객체에 접근하려면 socket.request.res를 사용함. 소켓 고유id에 접근하려면 socket.id를 사용하면 소켓의 주인을 특정 가능.
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log('새로운 클라이언트 접속!', ip, socket.id, req.ip);
    socket.on('disconnect', () => { //연결 종료 시
      console.log('클라이언트 접속 해제', ip, socket.id); // webSocket으로 연결할 때와 같이, 연결 이벤트리스너 안에 연결종료 이벤트리스너를 넣는다. 
      clearInterval(socket.interval);
    });
    socket.on('error', (error) => { //에러 시
      console.error(error);
    });
    socket.on('reply', (data) => { //클라이언트로부터 메시지 수신 시. 이것은 원래 있는 이벤트가 아닌 사용자가 직접 만든 이벤트.
      console.log(data);
    });
    socket.interval = serInterval(() => { //3초마다 클라이언트에 메시지 전송. ws에서는 send였지만 socket.io에서는 socket.emit 을 사용.
      socket.emit('news', 'Hello Socket.io');  //이벤트 이름, 데이터. 이것을 받으려면 클라이언트 사이드(프론트엔드)에서 news 이벤트 리스너를 미리 만들어놓아야 함
    }, 3000);

  });
};