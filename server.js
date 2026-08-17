const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;

const MAIN_ADMIN_EMAIL = (
  process.env.MAIN_ADMIN_EMAIL ||
  "admin@ndimakanini.com"
)
  .trim()
  .toLowerCase();

const MAIN_ADMIN_PASSWORD =
  process.env.MAIN_ADMIN_PASSWORD;


/* =========================================================
   REQUIRED SECURITY SETTINGS
========================================================= */

if (!JWT_SECRET || !MAIN_ADMIN_PASSWORD) {
  console.error(
    "Missing JWT_SECRET or MAIN_ADMIN_PASSWORD environment variables."
  );

  process.exit(1);
}


/* =========================================================
   BASIC MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: true
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);


/* =========================================================
   DATA FOLDERS
========================================================= */

const uploadsFolder = path.join(
  __dirname,
  "uploads"
);

const dataFolder = path.join(
  __dirname,
  "data"
);

const postsFile = path.join(
  dataFolder,
  "posts.json"
);

const adminsFile = path.join(
  dataFolder,
  "admins.json"
);


if (!fs.existsSync(uploadsFolder)) {
  fs.mkdirSync(
    uploadsFolder,
    {
      recursive: true
    }
  );
}


if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(
    dataFolder,
    {
      recursive: true
    }
  );
}


if (!fs.existsSync(postsFile)) {
  fs.writeFileSync(
    postsFile,
    "[]"
  );
}


if (!fs.existsSync(adminsFile)) {
  fs.writeFileSync(
    adminsFile,
    "[]"
  );
}


/* =========================================================
   JSON DATABASE HELPERS
========================================================= */

function readJson(file) {
  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    console.error(
      "Could not read:",
      file,
      error
    );

    return [];
  }
}


function writeJson(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(
      data,
      null,
      2
    )
  );
}


/* =========================================================
   SAFE ADMIN RESPONSE
========================================================= */

function safeUser(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    createdAt: admin.createdAt
  };
}


/* =========================================================
   CREATE MAIN ADMIN IF NEEDED
========================================================= */

async function ensureMainAdmin() {

  const admins =
    readJson(adminsFile);


  const mainAdminExists =
    admins.some(
      admin =>
        admin.role === "main_admin"
    );


  if (!mainAdminExists) {

    const passwordHash =
      await bcrypt.hash(
        MAIN_ADMIN_PASSWORD,
        12
      );


    const mainAdmin = {

      id: crypto.randomUUID(),

      name: "Main Administrator",

      email: MAIN_ADMIN_EMAIL,

      passwordHash,

      role: "main_admin",

      createdAt:
        new Date().toISOString()

    };


    admins.unshift(
      mainAdmin
    );


    writeJson(
      adminsFile,
      admins
    );


    console.log(
      "Main admin initialized:"
    );

    console.log(
      MAIN_ADMIN_EMAIL
    );
  }
}


/* =========================================================
   AUTHENTICATION MIDDLEWARE
========================================================= */

function requireAuth(
  req,
  res,
  next
) {

  const authHeader =
    req.headers.authorization || "";


  if (
    !authHeader.startsWith(
      "Bearer "
    )
  ) {

    return res
      .status(401)
      .json({
        message:
          "Login required."
      });

  }


  const token =
    authHeader.slice(7);


  try {

    req.user =
      jwt.verify(
        token,
        JWT_SECRET
      );


    next();

  } catch (error) {

    return res
      .status(401)
      .json({
        message:
          "Your session has expired. Please log in again."
      });

  }
}


/* =========================================================
   MAIN ADMIN ONLY
========================================================= */

function requireMainAdmin(
  req,
  res,
  next
) {

  if (
    req.user.role !==
    "main_admin"
  ) {

    return res
      .status(403)
      .json({
        message:
          "Main administrator access required."
      });

  }


  next();
}


/* =========================================================
   STATIC UPLOADS
========================================================= */

app.use(
  "/uploads",
  express.static(
    uploadsFolder
  )
);


/* =========================================================
   FILE UPLOAD CONFIGURATION
========================================================= */

const storage =
  multer.diskStorage({

    destination: function (
      req,
      file,
      cb
    ) {

      cb(
        null,
        uploadsFolder
      );

    },


    filename: function (
      req,
      file,
      cb
    ) {

      const extension =
        path.extname(
          file.originalname
        )
        .toLowerCase();


      const uniqueName =
        Date.now() +
        "-" +
        crypto
          .randomBytes(8)
          .toString("hex") +
        extension;


      cb(
        null,
        uniqueName
      );

    }

  });


const upload =
  multer({

    storage,

    limits: {

      fileSize:
        10 * 1024 * 1024,

      files: 2

    },


    fileFilter:
      function (
        req,
        file,
        cb
      ) {

        const allowedTypes = [

          "image/jpeg",

          "image/png",

          "image/webp",

          "application/pdf",

          "application/msword",

          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        ];


        const allowed =
          allowedTypes.includes(
            file.mimetype
          );


        if (allowed) {

          cb(
            null,
            true
          );

        } else {

          cb(
            new Error(
              "Only JPG, PNG, WEBP, PDF, DOC and DOCX files are allowed."
            ),
            false
          );

        }

      }

  });


/* =========================================================
   ROOT / HEALTH CHECK
========================================================= */

app.get(
  "/",
  (req, res) => {

    res.send(
      "Ndima Kanini Academy API is running."
    );

  }
);


app.get(
  "/api/health",
  (req, res) => {

    res.json({
      ok: true
    });

  }
);


/* =========================================================
   ADMIN LOGIN
========================================================= */

app.post(
  "/api/auth/login",
  async (req, res) => {

    try {

      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();


      const password =
        String(
          req.body.password || ""
        );


      if (
        !email ||
        !password
      ) {

        return res
          .status(400)
          .json({
            message:
              "Email and password are required."
          });

      }


      const admins =
        readJson(
          adminsFile
        );


      const admin =
        admins.find(
          item =>
            item.email ===
            email
        );


      if (!admin) {

        return res
          .status(401)
          .json({
            message:
              "Incorrect email or password."
          });

      }


      const passwordCorrect =
        await bcrypt.compare(
          password,
          admin.passwordHash
        );


      if (!passwordCorrect) {

        return res
          .status(401)
          .json({
            message:
              "Incorrect email or password."
          });

      }


      const token =
        jwt.sign(

          {
            id: admin.id,

            email:
              admin.email,

            role:
              admin.role

          },

          JWT_SECRET,

          {
            expiresIn:
              "8h"
          }

        );


      res.json({

        message:
          "Login successful.",

        token,

        user:
          safeUser(admin)

      });

    } catch (error) {

      console.error(
        error
      );

      res
        .status(500)
        .json({
          message:
            "Login failed."
        });

    }

  }
);


/* =========================================================
   LIST ADMINS
========================================================= */

app.get(
  "/api/admins",
  requireAuth,
  requireMainAdmin,
  (req, res) => {

    const admins =
      readJson(
        adminsFile
      );


    res.json(
      admins.map(
        safeUser
      )
    );

  }
);


/* =========================================================
   CREATE ADMIN
========================================================= */

app.post(
  "/api/admins",
  requireAuth,
  requireMainAdmin,
  async (req, res) => {

    try {

      const name =
        String(
          req.body.name || ""
        ).trim();


      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();


      const password =
        String(
          req.body.password || ""
        );


      if (
        !name ||
        !email ||
        password.length < 8
      ) {

        return res
          .status(400)
          .json({
            message:
              "Name, email and a password of at least 8 characters are required."
          });

      }


      const admins =
        readJson(
          adminsFile
        );


      const existing =
        admins.find(
          admin =>
            admin.email ===
            email
        );


      if (existing) {

        return res
          .status(409)
          .json({
            message:
              "That email is already registered as an admin."
          });

      }


      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      const newAdmin = {

        id:
          crypto.randomUUID(),

        name,

        email,

        passwordHash,

        role:
          "admin",

        createdAt:
          new Date().toISOString()

      };


      admins.push(
        newAdmin
      );


      writeJson(
        adminsFile,
        admins
      );


      res
        .status(201)
        .json({

          message:
            "Admin created.",

          admin:
            safeUser(
              newAdmin
            )

        });

    } catch (error) {

      console.error(
        error
      );

      res
        .status(500)
        .json({
          message:
            "Could not create admin."
        });

    }

  }
);


/* =========================================================
   DELETE ADMIN
========================================================= */

app.delete(
  "/api/admins/:id",
  requireAuth,
  requireMainAdmin,
  (req, res) => {

    let admins =
      readJson(
        adminsFile
      );


    const target =
      admins.find(
        admin =>
          admin.id ===
          req.params.id
      );


    if (!target) {

      return res
        .status(404)
        .json({
          message:
            "Admin not found."
        });

    }


    if (
      target.role ===
      "main_admin"
    ) {

      return res
        .status(400)
        .json({
          message:
            "The main administrator cannot be removed."
        });

    }


    admins =
      admins.filter(
        admin =>
          admin.id !==
          target.id
      );


    writeJson(
      adminsFile,
      admins
    );


    res.json({
      message:
        "Admin removed."
    });

  }
);


/* =========================================================
   GET ALL PUBLIC POSTS
========================================================= */

app.get(
  "/api/posts",
  (req, res) => {

    const posts =
      readJson(
        postsFile
      );


    res.json(
      posts
    );

  }
);


/* =========================================================
   CREATE POST
========================================================= */

app.post(
  "/api/posts",

  requireAuth,

  upload.fields([
    {
      name: "photo",
      maxCount: 1
    },

    {
      name: "file",
      maxCount: 1
    }

  ]),

  (req, res) => {

    const type =
      String(
        req.body.type || ""
      );


    const title =
      String(
        req.body.title || ""
      ).trim();


    const description =
      String(
        req.body.description || ""
      ).trim();


    const allowedPostTypes = [
      "news",
      "vacancy",
      "event"
    ];


    if (
      !allowedPostTypes.includes(
        type
      ) ||
      !title ||
      !description
    ) {

      return res
        .status(400)
        .json({
          message:
            "Valid type, title and description are required."
        });

    }


    const posts =
      readJson(
        postsFile
      );


    const post = {

      id:
        crypto.randomUUID(),

      type,

      title,

      description,

      deadline:
        req.body.deadline ||
        "",

      email:
        req.body.email ||
        "",

      eventDate:
        req.body.eventDate ||
        "",

      photo:
        req.files?.photo
          ? `/uploads/${req.files.photo[0].filename}`
          : "",

      file:
        req.files?.file
          ? `/uploads/${req.files.file[0].filename}`
          : "",

      createdAt:
        new Date().toISOString(),

      createdBy:
        req.user.email

    };


    posts.unshift(
      post
    );


    writeJson(
      postsFile,
      posts
    );


    res
      .status(201)
      .json({

        message:
          "Post published successfully.",

        post

      });

  }
);


/* =========================================================
   DELETE POST
========================================================= */

app.delete(
  "/api/posts/:id",
  requireAuth,
  async (req, res) => {

    const posts =
      readJson(
        postsFile
      );


    const post =
      posts.find(
        item =>
          item.id ===
          req.params.id
      );


    if (!post) {

      return res
        .status(404)
        .json({
          message:
            "Post not found."
        });

    }


    const updatedPosts =
      posts.filter(
        item =>
          item.id !==
          req.params.id
      );


    writeJson(
      postsFile,
      updatedPosts
    );


    res.json({
      message:
        "Post deleted successfully."
    });

  }
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      error
    );


    res
      .status(400)
      .json({

        message:
          error.message ||
          "Something went wrong."

      });

  }
);


/* =========================================================
   START SERVER
========================================================= */

ensureMainAdmin()
  .then(() => {

    app.listen(
      PORT,
      () => {

        console.log(
          `Server running on port ${PORT}`
        );

      }

    );

  })
  .catch(
    error => {

      console.error(
        "Could not initialize server:",
        error
      );

      process.exit(1);

    }
  );