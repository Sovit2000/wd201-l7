/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const express = require("express");
const csrf = require("tiny-csrf");

const { Todo, User } = require("./models");

const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

const passport = require("passport");
const connectEnsureLogin = require("connect-ensure-login");
const session = require("express-session");
const flash = require("connect-flash");
//var session = require("cookie-session");

const app = express();
app.set('trust proxy', 1);

const LocalStrategy = require("passport-local");
const bcrypt = require("bcrypt");
const saltRounds = 10;


app.use(express.urlencoded({ extended: false }));
const path = require("path");

app.set("views", path.join(__dirname, "views"));
app.use(flash());
const user = require("./models/user");

app.use(bodyParser.json());
app.use(cookieParser("ssh!!!! some secret string"));
app.use(csrf("this_should_be_32_character_long", ["POST", "PUT", "DELETE"]));

app.use(
  session({
    secret: "my-super-secret-key-21728172615261562",
    //resave: false,
    //saveUninitialized: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, //24hrs
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(function (request, response, next) {
  response.locals.messages = request.flash();
  next();
});

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    (username, password, done) => {
      User.findOne({ where: { email: username } })
        .then(async function (user) {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done(null, false, { message: "Invalid Password" });
          }
          // eslint-disable-next-line no-unreachable
          return done(null, user);
        })
        .catch((error) => {
          console.error(error);
          return done(null, false, { message: "You are not registered" });
        });
    }
  )
);

passport.serializeUser((user, done) => {
  console.log("Serializing user in session", user.id);
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findByPk(id)
    .then((user) => {
      done(null, user);
    })
    .catch((error) => {
      done(error, null);
    });
});

// seting the ejs is the engine
app.set("view engine", "ejs");

app.get("/", async(request, response) => {
  if(request.user){
    return response.redirect("/todos");
  }
  response.render("index", {
    title: "TO_DO_Application",
    csrfToken: request.csrfToken(),
  });
});

app.get(
  "/todos",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedIn = request.user.id;
    const userName =request.user.firstName+ "" +request.user.lastName;
    const allTodos = await Todo.getTodos(loggedIn);
    //const overdue = await Todo.overdue(loggedIn);
    const dueToday = await Todo.dueToday(loggedIn);
    const dueLater = await Todo.dueLater(loggedIn);
    const completedItems = await Todo.completedItems(loggedIn);
    if (request.accepts("html")) {
      response.render("todos", {
        title: "TO_DO_Application",
        userName,
        //allTodos,
        overdue,
        dueToday,
        dueLater,
        completedItems,
        csrfToken: request.csrfToken(),
      });
    } else {
      response.json({ 
        //allTodos, 
        overdue, 
        dueToday, 
        dueLater
       });
    }
  }
);

app.use(express.static(path.join(__dirname, "public")));

//Signup page
app.get("/signup",(request,response) => {
  response.render("signup", {
    title: "Signup",
    csrfToken: request.csrfToken(),
  });
});

app.post("/users", async (request, response) => {
  if (request.body.firstName.length == 0) {
    request.flash("error", "Please enter your FirstName");
    return response.redirect("/signup");
  }
  if (request.body.email.length == 0) {
    request.flash("error", "Please enter your Email-address");
    return response.redirect("/signup");
  }
  if (request.body.password.length < 8) {
    request.flash("error", " Password con not be empty");
    return response.redirect("/signup");
  }

  console.log("FirstName", request.body.firstName);
  //Hash password using bcrypt
  const hashedPwd = await bcrypt.hash(request.body.password, saltRounds);
  console.log(hashedPwd);
  // Have to create the user here
  try {
    const user = await User.create({
      firstName: request.body.firstName,
      lastName: request.body.lastName,
      email: request.body.email,
      password: hashedPwd,
    });
    request.login(user, (err) => {
      if (err) {
        console.log(err);
        response.redirect("/");
      } else {
        request.flash("success", "Sign up successfully")
        response.redirect("/todos");
      }
    })
  } catch (error) {
    request.flash("error", "User already exist with this email");
    return response.redirect("/signup");
  }
});

//login page
app.get("/login", (request, response) => {
  response.render("login", {
    title: "Login",
    csrfToken: request.csrfToken(),
  });
})

app.post(
  "/session",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  function (request, response) {
    console.log(request.user);
    response.redirect("/todos");
  }
);

//signout page
app.get("/signout", (request, response, next) => {
  // SignOut
  request.logout((err) => {
    if (err) {
      return next(err);
    }
    response.redirect("/");
  })
});

app.get("/todos", (request, response) => {
  console.log("Todo List", request.body);
});

app.post(
  "/todos",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.body.title.length == 0) {
      request.flash("error", "Title won't be left empty!");
      return response.redirect("/todos");
    }
    if (request.body.dueDate.length == 0) {
      request.flash("error", "Due date won't be left empty!");
      return response.redirect("/todos");
    }

    console.log("Creating a To Do", request.body);
    console.log(request.user);
    try {
      console.log("entering in try block");
      const todo = await Todo.addTodo({
        title: request.body.title,
        dueDate: request.body.dueDate,
        completed: false,
        UserID: request.user.id,
      });
      return response.redirect("/todos");
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.put(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const todo = await Todo.findByPk(request.params.id);
    try {
      const upTodo = await todo.setCompletionStatus(request.body.completed);
      return response.json(upTodo);
    } catch (error) {
      return response.status(422).json(error);
    }
  }
);

// eslint-disable-next-line no-unused-vars
app.delete(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    console.log("We have deleted Todo ID");
    const deleteFlag = await Todo.destroy({ where: { id: request.params.id } });
    response.send(deleteFlag ? true : false);
  }
);

module.exports = app;
