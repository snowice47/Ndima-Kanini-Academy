const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uploadsFolder = path.join(__dirname, "uploads");
const dataFolder = path.join(__dirname, "data");
const postsFile = path.join(dataFolder, "posts.json");

if (!fs.existsSync(uploadsFolder)) {
  fs.mkdirSync(uploadsFolder, { recursive: true });
}

if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
}

if (!fs.existsSync(postsFile)) {
  fs.writeFileSync(postsFile, "[]");
}

app.use("/uploads", express.static(uploadsFolder));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsFolder);
  },

  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() +
      "-" +
      crypto.randomBytes(6).toString("hex") +
      path.extname(file.originalname);

    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only images, PDF, DOC and DOCX files are allowed."
        )
      );
    }
  }
});

function getPosts() {
  return JSON.parse(
    fs.readFileSync(postsFile, "utf8")
  );
}

function savePosts(posts) {
  fs.writeFileSync(
    postsFile,
    JSON.stringify(posts, null, 2)
  );
}

/* GET ALL POSTS */

app.get("/api/posts", (req, res) => {

  const posts = getPosts();

  res.json(posts);

});


/* CREATE POST */

app.post(
  "/api/posts",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "file", maxCount: 1 }
  ]),

  (req, res) => {

    const posts = getPosts();

    const newPost = {
      id: crypto.randomUUID(),

      type: req.body.type,
      title: req.body.title,
      description: req.body.description,

      deadline: req.body.deadline || "",
      email: req.body.email || "",
      eventDate: req.body.eventDate || "",

      photo: req.files?.photo
        ? `/uploads/${req.files.photo[0].filename}`
        : "",

      file: req.files?.file
        ? `/uploads/${req.files.file[0].filename}`
        : "",

      createdAt: new Date().toISOString()
    };

    posts.unshift(newPost);

    savePosts(posts);

    res.status(201).json({
      message: "Post published successfully",
      post: newPost
    });

  }
);


/* DELETE POST */

app.delete("/api/posts/:id", (req, res) => {

  let posts = getPosts();

  const post = posts.find(
    item => item.id === req.params.id
  );

  if (!post) {
    return res.status(404).json({
      message: "Post not found"
    });
  }

  posts = posts.filter(
    item => item.id !== req.params.id
  );

  savePosts(posts);

  res.json({
    message: "Post deleted successfully"
  });

});


/* SERVER TEST */

app.get("/", (req, res) => {
  res.send("Ndima Kanini Academy API is running.");
});


app.use((error, req, res, next) => {

  console.error(error);

  res.status(400).json({
    message: error.message || "Something went wrong."
  });

});


app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});