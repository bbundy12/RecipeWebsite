// Brendan Bundy, Mckenna Alder, Tanner Atkin, Jakob Blosil, Secion 003
// This application allows users to add recipes to a database once they have created an account.
// They can edit their account information. They can also edit their recipe information. They can view all
// of their recipe data. The main functionality of the website is that a shopping list can be generated
// for the user after they select the recipes they want to generate th list for.

const express = require("express");

let app = express();

let path = require("path");

const port = process.env.PORT;

const puppeteer = require("puppeteer");

const multer = require("multer");
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const knex = require("knex")({
  client: "pg",
  connection: {
    host: process.env.RDS_HOSTNAME,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DB_NAME,
    port: process.env.RDS_PORT,
    ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false,
  },
});

knex
  .raw("SELECT * from users")
  .then(() => {
    console.log("Connection to database successful");
    // You can start using your knex instance here
  })
  .catch((err) => {
    console.error("Error connecting to database:", err);
  });

app.get("/", (req, res) => {
  try {
    res.render("index", { error: null });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/createUser", (req, res) => {
  try {
    res.render("createUser", {});
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    // Check if the username and password match a user in the database
    const users = await knex.select("user_id", "username", "password").from("users").where("username", req.body.username).andWhere("password", req.body.password);

    console.log("Number of results:", users.length);

    const user_id = users[0].user_id;

    if (users.length == 1) {
      // If at least one user is found, you can redirect to a different route or render a page
      res.redirect("/userLanding/" + user_id);
    } else {
      // If no user is found, you can render the login page with an error message
      res.render("loginUser", { error: "Invalid username or password" });
    }
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/storeUser", async (req, res) => {
  try {
    // Check if the new username already exists
    const existingUser = await knex("users").where("username", req.body.username).select("username");

    if (existingUser.length > 0) {
      // If the username already exists, render the createUser page with an error
      res.render("createUser", { error: "Username Already Taken" });
      return; // Add return to stop further execution
    } else {
      // If the username is not taken, insert the new user
      await knex("users").insert({ username: req.body.username, password: req.body.password });
      res.redirect("accountCreated");
    }
  } catch (err) {
    console.error("Error storing user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/editUser", (req, res) => {
  res.render("editUser");
});

app.post("/updatePassword", (req, res) => {
  try {
    // Retrieve data from the form submission
    const currentPassword = req.body.currentPassword;
    const newPassword = req.body.newPassword;
    const confirmNewPassword = req.body.confirmNewPassword;
    const Username = req.body.username;

    // Update the password in the database
    knex("users")
      .where("username", Username)
      .update({ password: newPassword })
      .then(() => {
        // Password updated successfully, redirect to a success page
        res.redirect("/updatedPassword");
      })
      .catch((error) => {
        // Handle database update error (redirect to editUser with an error)
        res.render("editUser", { error: "Error updating password" });
      });
  } catch (error) {
    // Handle other errors (redirect to editUser with a generic error)
    res.render("editUser", { error: "An unexpected error occurred" });
  }
});

app.get("/updatedPassword", (req, res) => {
  res.render("updatedPassword");
});

app.get("/login", (req, res) => {
  res.render("loginUser");
});

app.get("/recipeSubmitted", (req, res) => {
  res.render("recipeSubmitted");
});

app.get("/userLanding/:user_id", async (req, res) => {
  try {
    const user_id = req.params.user_id;
    const recipes = await knex("recipes").where("user_id", user_id).select("title");

    res.render("userLanding", { recipes, user_id });
  } catch (error) {
    console.error("Error fetching recipes:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/recipeView/:recipe_id", async (req, res) => {
  try {
    const recipe_id = req.params.recipe_id;

    // Fetch the recipe and its related data from the database
    const recipe = await knex("recipes").where("recipe_id", recipe_id).first(); // Assuming you expect only one recipe per recipe_id
    const ingredients = await knex("ingredients")
      .join("recipe_ingredients", "ingredients.ingredient_id", "recipe_ingredients.ingredient_id")
      .select("ingredients.name", "recipe_ingredients.quantity", "recipe_ingredients.unit")
      .where("recipe_ingredients.recipe_id", recipe_id);

    // Render the view with the fetched data
    res.render("recipeView", { recipe, ingredients });
  } catch (error) {
    console.error("Error fetching recipe:", error);
    res.status(500).send("Internal Server Error");
  }
});

// POST route to aggregate ingredients for selected recipes
app.post("/aggregate_ingredients", async (req, res) => {
  try {
    // Extract selected recipe names from the request
    const selectedRecipes = req.body.selectedRecipes;

    // Query to get ingredients
    const ingredientsQuery = await knex
      .select("Recipes.title", "Ingredients.name", "Recipe_Ingredients.unit", "Recipe_Ingredients.quantity")
      .from("Recipes")
      .join("Recipe_Ingredients", "Recipes.recipe_id", "Recipe_Ingredients.recipe_id")
      .join("Ingredients", "Recipe_Ingredients.ingredient_id", "Ingredients.ingredient_id")
      .whereIn("Recipes.title", selectedRecipes);

    // Array to hold aggregated ingredients
    let aggregatedIngredients = [];

    // Iterate through query results and aggregate quantities
    for (let iQuery = 0; iQuery < ingredientsQuery.length; iQuery++) {
      let bFound = false;
      for (let iNum = 0; iNum < aggregatedIngredients.length && !bFound; iNum++) {
        if (aggregatedIngredients[iNum][0] === ingredientsQuery[iQuery].name && aggregatedIngredients[iNum][2] === ingredientsQuery[iQuery].unit) {
          aggregatedIngredients[iNum][1] += ingredientsQuery[iQuery].quantity;
          bFound = true;
        }
      }
      if (!bFound) {
        aggregatedIngredients.push([ingredientsQuery[iQuery].name, ingredientsQuery[iQuery].quantity, ingredientsQuery[iQuery].unit]);
        bFound = true;
      }
    }

    // Create an HTML template for the PDF
    let htmlContent = `<html><head><style>/* Your CSS styles here */</style></head><body>`;
    htmlContent += `<h1>Aggregated Ingredients</h1><ul>`;
    aggregatedIngredients.forEach((ingredient) => {
      htmlContent += `<li>${ingredient[0]}: ${ingredient[1]} ${ingredient[2]}</li>`;
    });
    htmlContent += `</ul></body></html>`;

    // Launch Puppeteer and create a PDF
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    const pdf = await page.pdf({ format: "A4" });

    // Send the PDF as a response
    res.contentType("application/pdf");
    res.send(pdf);

    await browser.close();
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/storeRecipe", async (req, res) => {
  try {
    const { recipe_title, servings, recipe_instructions } = req.body;
    const ingredients = [];

    // Iterate through form data to collect ingredient information
    Object.keys(req.body).forEach((key) => {
      if (key.startsWith("ingredient_name_")) {
        const uniqueCounter = key.split("_")[2]; // Extract uniqueCounter from key
        const ingredient = {
          name: req.body[`ingredient_name_${uniqueCounter}`],
          quantity: req.body[`quantity_${uniqueCounter}`],
          measurement: req.body[`measurement_${uniqueCounter}`],
        };
        ingredients.push(ingredient);
      }
    });

    console.log("Ingredients:", ingredients);

    // Use Knex transactions to ensure atomicity
    await knex.transaction(async () => {
      // Insert into the recipes table
      const imagePath = req.file ? req.file.path : null;

      // Use 'await' to capture the result of the insert and 'returning'
      await knex("recipes")
        .insert({
          title: req.body.recipe_title,
          servings: req.body.servings,
          recipe_instructions: recipe_instructions,
          image: imagePath,
        })
        .returning("recipe_id");

      // Insert into the ingredients table and recipe_ingredients junction table
      for (let iCount = 0; iCount < ingredients.length; iCount++) {
        // Use 'await' for the result of the insert and 'returning'
        console.log(ingredient);
        await knex("ingredients").insert({ name: ingredient.name }).returning("ingredient_id");

        const recipeIdPromise = knex("recipes")
          .select("recipe_id")
          .where("title", "=", req.body.recipe_title)
          .then((rows) => rows[0].recipe_id);

        const recipeId = await recipeIdPromise;
        console.log("Recipe ID:", recipeId);

        const ingredientid = ingredientId[0].ingredient_id;

        // Use 'await' for the result of the insert into 'recipe_ingredients'
        await knex("recipe_ingredients").insert({
          recipe_id: recipeId,
          ingredient_id: ingredientid,
          quantity: ingredient.quantity,
          unit: ingredient.measurement,
        });
      }
    });

    res.redirect("/recipeSubmitted");
  } catch (error) {
    console.error("Error processing form data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/logout", (req, res) => {
  res.render("logoutSuccessful");
});

app.get("/accountCreated", (req, res) => {
  res.render("accountCreated");
});

app.get("/createRecipe", (req, res) => {
  res.render("createRecipe");
});

app.get("/editRecipe", async (req, res) => {
  try {
    const { recipeTitle, username } = req.query;

    // Fetch user details (to ensure correct user and get user_id)
    const user = await knex("Users").where("username", username).first();
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Fetch recipe details linked to the user
    const recipe = await knex("Recipes").where("title", recipeTitle).andWhere("user_id", user.user_id).first();

    if (!recipe) {
      return res.status(404).send("Recipe not found");
    }

    // Fetch recipe ingredients
    const ingredients = await knex("Recipe_Ingredients")
      .join("Ingredients", "Recipe_Ingredients.ingredient_id", "Ingredients.ingredient_id")
      .where("recipe_id", recipe.recipe_id)
      .select("Ingredients.name", "Recipe_Ingredients.quantity", "Recipe_Ingredients.unit");

    res.render("updateRecipe", { recipe, ingredients });
  } catch (error) {
    console.error("Error fetching recipe:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/updateRecipe", async (req, res) => {
  try {
    const { recipe_id, user_id, title, servings, image, description, ingredients } = req.body;

    // Begin a transaction
    await knex.transaction(async (trx) => {
      // Update recipe details
      await trx("Recipes").where("recipe_id", recipe_id).update({
        title,
        servings,
        image,
        description,
      });

      // Update each ingredient
      for (const ingredient of ingredients) {
        const ingredientRecord = await trx("Ingredients").where("name", ingredient.name).first();
        if (ingredientRecord) {
          await trx("Recipe_Ingredients").where("recipe_id", recipe_id).andWhere("ingredient_id", ingredientRecord.ingredient_id).update({
            quantity: ingredient.quantity,
            unit: ingredient.unit,
          });
        }
      }
    });

    res.redirect("/someSuccessPage"); // Redirect after successful update
  } catch (error) {
    console.error("Error updating recipe:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(port, () => console.log("Express App has started and server is listening!"));
