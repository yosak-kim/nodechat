const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Room = require('../schemas/room');
const Chat = require('../schemas/chat');

const router = express.Router();
router.get('/', async (req, res, next) => {
  try {
    const rooms = await Room.find({});
    res.render('main', { rooms, title: 'GIF 채팅방' });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.get('/room', (req, res) => {
  res.render('room', { title: 'GIF 채팅방 생성' });
});

router.post('/room', async (req, res, next) => {
  try {
    const newRoom = await Room.create({
      title: req.body.title,
      max: req.body.max,
      owner: req.session.color,
      password: req.body.password,
    });
    const io = req.app.get('io');
    io.of('/room').emit('newRoom', newRoom); //room 네임스페이스 접속한 모두에게 newRoom 이벤트를 보냄. 네임스페이스가 없는 경우엔 io.emit() 라고 써야 함.
    res.redirect(`/room/${newRoom._id}?password=${req.body.password}`);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.get('/room/:id', async (req, res, next) => { // 채팅방을 렌더링. if문 연속으로 갖가지 오류 검출함
  try {
    const room = await Room.findOne({ _id: req.params.id });
    const io = req.app.get('io'); // socket.js에서 io로 저장했던 객체를 불러옴. 
    if (!room) {
      return res.redirect('/?error=존재하지 않는 방입니다.');
    }
    if (room.password && room.password !== req.query.password) {
      return res.redirect('/?error=비밀번호가 틀렸습니다.');
    }
    const { rooms } = io.of('/chat').adapter; // io.of('/chat').adapter.rooms에 방 목록이 있는데 이것을 그대로 불러옴. 해당 방의 소켓목록은 rooms[req.params.id]
    if (rooms && rooms[req.params.id] && room.max <= rooms[req.params.id].length) { //rooms[req.params.id] 의 수를 세면 참가인원의 수임
      return res.redirect('/?error=허용 인원을 초과했습니다.');
    }
    const chats = await Chat.find({ room: room._id }).sort('createdAt'); //방 접속 시 DB에 저장된 기존 채팅 내역을 불러오도록 함.
    return res.render('chat', {
      room,
      title: room.title,
      chats, //여기서 이전 대화내역을 불러옴
      current: (rooms && rooms[req.params.id] && rooms[req.params.id].length + 1) || 1, //그냥 rooms[req.params.id].length 만 하면 length가 없다고 오류가 뜨는 이유가 뭐지?
      user: req.session.color,
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

router.delete('/room/:id', async (req, res, next) => {
  try {
    await Room.deleteOne({ _id: req.params.id }); // 작동하지 않는 remove함수를 대체하여 deleteOne과 deleteMany를 사용함
    await Chat.deleteMany({ room: req.params.id });
    res.send('ok'); //이건 왜 들어간 거지?? 검색해보니 res.send(200) 과 비슷하게, 올바른 요청이라는 응답을 이렇게 나타낸 것으로 보인다.
    setTimeout(() => {
      req.app.get('io').of('/room').emit('removeRoom', req.params.id);
    }, 2000);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.post('/room/:id/chat', async (req, res, next) => {
  try {
    const chat = await Chat.create({
      room: req.params.id, //소켓id까지는 DB에 저장할 필요 없으므로, 이렇게만 저장하고 밑에 emit할 땐 socket 포함해서 다시 씀
      user: req.session.color,
      chat: req.body.chat,
    });
    req.app.get('io').of('/chat').to(req.params.id).emit('chat', {
      socket: req.body.sid, //귓속말을 위해 추가. 메시지를 보내는 순간 송신자의 소켓id가 실린 채 보내진다.
      room: req.params.id,
      user: req.session.color,
      chat: req.body.chat,
    }); //'/room/:id/chat도, /room/:id/gif도, /room/:id/sys도, 메시지를 뿌리려면 무조건 emit을 써야 한다.
    res.send('ok');
  } catch (error) {
    console.error(error);
    next(error);
  }
});

try {
  fs.readdirSync('uploads');
} catch (err) {
  console.error('uploads 폴더가 없어 upload 폴더를 생성합니다.');
  fs.mkdirSync('uploads');
}
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, done) {
      done(null, 'uploads/');
    },
    filename(req, file, done) {
      const ext = path.extname(file.originalname);
      done(null, path.basename(file.originalname, ext) + Date.now() + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/room/:id/gif', upload.single('gif'), async (req, res, next) => {
  try {
    const chat = await Chat.create({
      room: req.params.id,
      user: req.session.color,
      gif: req.file.filename,
    });
    req.app.get('io').of('/chat').to(req.params.id).emit('chat', {
      socket: req.body.sid,
      room: req.params.id,
      user: req.session.color,
      gif: req.file.filename,
    });
    res.send('ok');
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.post('/room/:id/sys', async (req, res, next) => {
  try {
    const chat = req.body.type === 'join'
      ? `${req.session.color}님이 입장하셨습니다.`
      : `${req.session.color}님이 퇴장하셨습니다.`;
    const sys = await Chat.create({
      room: req.params.id,
      user: 'system',
      chat,
    });
    req.app.get('io').of('/chat').to(req.params.id).emit(req.body.type, {
      user: 'system',
      chat,
    });
    res.send('ok');
  } catch (error) {
    console.error(error);
    next(error);
  }
});




module.exports = router;