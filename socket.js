const SocketIO = require('socket.io');
const axios = require('axios');
/**서버에서 axios요청을 보낼 경우 쿠키가 같이 보내지지 않아 express-session이 요청자가 누구인지 식별할 수 없음.*/
/**그래서 요청 헤더에 세션쿠키를 직접 넣어서 보내기 위해 cookieParser모듈을 사용해서 io객체에 연결함*/
const cookieParser = require('cookie-parser');

const cookie = require('cookie-signature');//쿠키 암호화를 위해 cookie-signature 모듈도 사용

/**여기서부터는 io와 socket객체가 Socket.io의 핵심 */
module.exports = (server, app, sessionMiddleware) => {
  const io = SocketIO(server, { path: '/socket.io' }); // 두 번째 인수인 옵션객체에서 다양한 설정을 지원한다. 여기서는 path만 사용. 클라이언트에서도 저 경로와 일치하는 path를 넣어야 작동함.
  app.set('io', io); // 라우터에서 io객체를 쓸 수 있도록 저장
  const room = io.of('/room');  //of는 socket.io에 네임스페이스를 부여하는 메소드. socket.io는 기본적으로 '/'네임스페이스를 사용하지만 of로 다른 네임스페이스를 만들 수 있음. 같은 네임스페이스끼리만 데이터 전달함
  const chat = io.of('/chat');

  io.use((socket, next) => {
    cookieParser(process.env.COOKIE_SECRET)(socket.request, socket.request.res, next); //요청을 보낼 때 쿠키를 심기 위해 io객체에 cookie-parser을 연결
    sessionMiddleware(socket.request, socket.request.res, next);
  });


  room.on('connection', (socket) => { //room 네임스페이스에 이벤트리스너 달아주기
    console.log('room 네임스페이스에 접속');
    socket.on('disconnect', () => {
      console.log('room 네임스페이스 접속 해제');
    });
  });

  chat.on('connection', (socket) => { //chat 네임스페이스에 이벤트리스너 달아주기
    console.log('chat 네임스페이스에 접속');
    const req = socket.request;
    const { headers: { referer } } = req;
    const roomId = referer
      .split('/')[referer.split('/').length - 1]
      .replace(/\?.+/, '');
    socket.join(roomId); //join과 밑에 leave는 방에 들어가고 나가는 메서드. 
    /** 네임스페이스보다 더 세부적인 개념인 방이 있으며, 같은 방 안의 소켓끼리만 데이터 주고받기 가능 */
    /** join과 leave는 방의 아이디를 인수로 받음*/
    /** socket.request.headers.referer로 현재 페이지 URL 가져올 수 있음. 여기서 split과 replace로 방 아이디 부분 따냄 */

    socket.to(roomId).emit('join', { //to 메소드로 특정 방에 데이터를 보낼 수 있음
      user: 'system',
      chat: `${req.session.color}님이 입장하셨습니다.`, //sessionMiddleware를 달아주었으므로 세션에서 불러올 수 있음
    });

    socket.on('disconnect', () => {
      console.log('chat 네임스페이스 접속 해제');
      socket.leave(roomId);
      const currentRoom = socket.adapter.rooms[roomId]; // socket.adapter.rooms[roomId]에 참여중인 소켓 정보가 모두 들어있음
      const userCount = currentRoom ? currentRoom.length : 0;
      if (userCount === 0) {
        const signedCookie = req.signedCookies['connect.sid']; //axios 요청을 보낼 때 connect.sid 쿠키를 직접 설정함. 쿠키 암호화도 포함됨
        const connectSID = cookie.sign(signedCookie, process.env.COOKIE_SECRET);
        axios.delete(`http://localhost:8005/room/${roomId}`, {
          headers: {
            Cookie: `connect.sid=s%3A${connectSID}`, //express-session에 의해 서명된 세션 쿠키의 앞부분엔 s%3A가 붙음. 원래는 s:로 시작하지만 encodeURIComponent 함수에 의해 s%3A로 바뀜. 이 뒷부분이 실제 쿠키의 내용임.
          },
        })
          .then(() => {
            console.log('방 제거 요청 성공');
          })
          .catch((error) => {
            console.error(error);
          });
      } else {
        socket.to(roomId).emit('exit', {
          user: 'system',
          chat: `${req.session.color}님이 퇴장하셨습니다.`,
        });
      }
    });
  });
};