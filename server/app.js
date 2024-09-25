const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fse = require("fs-extra");
const path = require("path");
const multipart = require("connect-multiparty");
const multipartMiddleware = multipart();
const port = 3000;
const uploadHost = `http://localhost:${port}/uploads/`

const app = express();

app.use(cors());
app.use(bodyParser.json());

// 所有上传的文件存放在该目录下
const UPLOADS_DIR = path.resolve("uploads");

// 单文件上传
app.post("/singleUpload", multipartMiddleware, (req, res) => {
  const file = req.files.file;
  const filePath = path.resolve(UPLOADS_DIR, file.name);
  fse.moveSync(file.path, filePath);
  res.send({
    success: true,
    msg: "上传成功",
  });
})

// 单文件上传
app.post("/bigFileUpload", multipartMiddleware, (req, res) => {
  const body = req.body;
  console.log(body);
  let files = req.files || [];
  const { chunkIndex, totalChunks, fileName } = body;
  if (files && !Array.isArray(files)) { //单文件上传容错
    files = [files];
  }

  files && files.forEach(item => {
    console.log(item);
    var path = item.path;
    var nextPath = path.slice(0, path.lastIndexOf('/') + 1) + chunkIndex + '-' + fileName;
    if (item.size > 0 && path) {
      //得到扩展名
      var extArr = fileName.split('.');
      var ext = extArr[extArr.length - 1];
      //var nextPath = path + '.' + ext;
      //重命名文件
      fs.renameSync(path, nextPath);
      result.push(uploadHost + nextPath.slice(nextPath.lastIndexOf('/') + 1));
    }
  });

})

/**
 * 上传
 */
app.post("/upload", multipartMiddleware, (req, res) => {
  const { fileHash, chunkHash } = req.body;
  console.log('fileHash', fileHash);
  console.log('chunkHash', chunkHash);

  // 如果临时文件夹(用于保存分片)不存在，则创建
  const chunkDir = path.resolve(UPLOADS_DIR, fileHash);
  if (!fse.existsSync(chunkDir)) {
    fse.mkdirSync(chunkDir);
  }

  // 如果临时文件夹里不存在该分片，则将用户上传的分片移到临时文件夹里
  const chunkPath = path.resolve(chunkDir, chunkHash);
  if (!fse.existsSync(chunkPath)) {
    fse.moveSync(req.files.chunk.path, chunkPath);
  }

  res.send({
    success: true,
    msg: "上传成功",
  });
});

/**
 * 合并
 */
app.post("/merge", async (req, res) => {
  const { fileHash, fileName } = req.body;
  console.log('fileHash', fileHash);

  // 最终合并的文件路径
  const filePath = path.resolve(UPLOADS_DIR, fileHash + path.extname(fileName));
  // 临时文件夹路径
  const chunkDir = path.resolve(UPLOADS_DIR, fileHash);

  // 读取临时文件夹，获取该文件夹下“所有文件（分片）名称”的数组对象
  const chunkPaths = fse.readdirSync(chunkDir);

  // 读取临时文件夹获得的文件（分片）名称数组可能乱序，需要重新排序
  chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);

  // 遍历文件（分片）数组，将分片追加到文件中
  const pool = chunkPaths.map(
    (chunkName) =>
      new Promise((resolve) => {
        const chunkPath = path.resolve(chunkDir, chunkName);
        // 将分片追加到文件中
        fse.appendFileSync(filePath, fse.readFileSync(chunkPath));
        // 删除分片
        fse.unlinkSync(chunkPath);
        resolve();
      })
  );
  await Promise.all(pool);
  // 等待所有分片追加到文件后，删除临时文件夹
  fse.removeSync(chunkDir);

  res.send({
    success: true,
    msg: "合并成功",
  });
});

/**
 * 校验
 */
app.post("/verify", (req, res) => {
  const { fileHash, fileName } = req.body;

  // 判断服务器上是否存在该hash值的文件
  const filePath = path.resolve(UPLOADS_DIR, fileHash + path.extname(fileName));
  const existFile = fse.existsSync(filePath);

  // 获取已经上传到服务器的文件分片
  const chunkDir = path.resolve(UPLOADS_DIR, fileHash);
  const existChunks = [];
  if (fse.existsSync(chunkDir)) {
    existChunks.push(...fse.readdirSync(chunkDir));
  }

  res.send({
    success: true,
    msg: "校验文件",
    data: {
      existFile,
      existChunks,
    },
  });
});

const server = app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
