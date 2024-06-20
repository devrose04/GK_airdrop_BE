const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");
const axios = require("axios");
const cron = require('node-cron');

const { delay } = require("./app/utils");

const END_CLEARING_PRICE = Number(process.env.END_CLEARING_PRICE);
const STEPPING_PRICE = Number(process.env.STEPPING_PRICE);
const STARTING_PRICE = Number(process.env.STARTING_PRICE);

const app = express();

const TEST_MODE = true;
const RATE = 10000;

let finished = false;
let blockHeight = 0;
let dbDate = [];
let globalErrorText = "";

// const corsOptions = {
//   credentials: false,
//   origin: "https://galactickingdomoffering.com",
// };

const corsOptions = {
  credentials: false,
  origin: process.env.BACKEND_URL
};
app.use(cors());

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

app.use(
  cookieSession({
    name: "bezkoder-session",
    keys: ["COOKIE_SECRET"], // should use as secret environment variable
    httpOnly: true,
  })
);

const db = require("./app/models");
const Block = db.block;

db.mongoose
  .connect(
    process.env.MONGODB_CONNECTION_URL,
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(async () => {
    console.log("Successfully connect to MongoDB.");
    blockHeight = 0;
    await init();

    if (finished == false) {
      cron.schedule('*/5 * * * * *', updateBlockHeight);
    }
  })
  .catch((err) => {
    console.error("Connection error", err);
    process.exit();
  });

// simple route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Galactic Kingdom Dutch Auction." });
});

app.get("/recentBlock", async (req, res) => {
  res.status(200).json({
    recentBlock: blockHeight,
    BlockList: dbDate,
  });
});

app.post("/saveTx", async (req, res) => {
  try {
    const {
      tx,
      recentBlockHeight,
      ordinalsAddress,
      ordinalsPublicKey,
      paymentAddress,
      paymentPublicKey,
      BtcAmount,
    } = req.body;
    console.log("tx ==> ", tx);
    console.log("recentBlockHeight ==> ", recentBlockHeight);

    // check tx repeatance
    console.log("dbDate ==> ", dbDate);
    let checkRepatance = false;

    dbDate.map((value) => {
      if (value.buyers.length > 0) {
        if (value.buyers.find((buyer) => buyer.tx == tx)) {
          checkRepatance = true;
        }
      }
    });
    console.log("checkRepeatance ==> ", checkRepatance);
    if (checkRepatance) {
      globalErrorText = 'Already confirmed';
      res.status(500).json({
        msg: globalErrorText,
      });
      return;
    }
    const flag = await checkVout(tx, BtcAmount);

    if (!flag) {
      res.status(500).json({
        msg: globalErrorText,
      });
      return;
    }

    console.log("be ready to store the data");
    const raw = await Block.findOne({
      blockHeight: recentBlockHeight,
    });

    if (!raw) {
      res.status(500).json({ msg: "There is no block to store in the DB" });
      return;
    }

    console.log("raw ==> ", raw);

    const buyers = {
      tx,
      ordinalsAddress,
      ordinalsPublicKey,
      paymentAddress,
      paymentPublicKey,
      BtcAmount,
    };

    raw.buyers.push(buyers);
    const payload = await raw.save();

    res.status(200).json({ msg: payload });
    return;
  } catch (error) {
    console.log("error ==> ", error);
    res.status(500).json({
      msg: "something error!!",
    });
  }
});

app.post("/finishAuction", async (req, res) => {
  try {
    finished = true;
    console.log('Get the signal from the FE');
    res.json({message: "Succeed"})
  } catch (error) {
    console.log('finish error ==> ', error);
  }
})

// set port, listen for requests
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

async function init() {
  const payload = await axios.get(
    TEST_MODE
      ? "https://mempool.space/testnet/api/blocks"
      : "https://mempool.space/api/blocks"
  );
  const temp = payload.data[0].height;
  blockHeight = temp;
  console.log("init blockHeight ==> ", blockHeight);
  dbDate = await Block.find();

  if (dbDate.length == 0) {
    const newBlock = new Block({
      blockHeight: temp,
      buyers: [],
    });

    await newBlock.save();

    dbDate = await Block.find();
  } else if (STARTING_PRICE - STEPPING_PRICE * dbDate.length < END_CLEARING_PRICE) {
    finished = true;
    console.log('the auction is ended!!')
  }
}

async function updateBlockHeight() {
  try {
    if (finished == false) {
      console.log("updateBlockHeight is working well");
      const payload = await axios.get(
        TEST_MODE
          ? "https://mempool.space/testnet/api/blocks"
          : "https://mempool.space/api/blocks"
      );
      const temp = payload.data[0].height;

      if (temp != blockHeight) {
        console.log("New block!!");
        const newBlock = new Block({
          blockHeight: temp,
          buyers: [],
        });

        await newBlock.save();

        dbDate = await Block.find();
        blockHeight = temp;

        if (STARTING_PRICE - STEPPING_PRICE * dbDate.length < END_CLEARING_PRICE) {
          finished = true;
        }
      } else {
        blockHeight = temp;
        console.log("Exist block!!");
        dbDate = await Block.find();
      }

      console.log("blockHeight ==>", blockHeight);
      console.log("dbDate ==>", dbDate[dbDate.length - 1].buyers);
    } else {
      console.log('the auction is ended!!')
    }
  } catch (error) {
    console.log("Interval error ==> ", error.message);
  }
}

async function checkVout(tx, BtcAmount) {
  try {
    await delay(8000);
    console.log("checkVout ==> ");
    console.log(`https://mempool.space/testnet/api/tx/${tx}`);
    const payload = await axios.get(
      `https://mempool.space/testnet/api/tx/${tx}`
    );

    console.log("payload ==> ");
    const { vout } = payload.data;
    console.log("vout ==> ", vout);
    let validFlag = false;
    vout.map((value, index) => {
      console.log("value.value ==> ", value.value);
      console.log("BtcAmount ==> ", BtcAmount);
      if (
        value.scriptpubkey_address == process.env.TREASURE_WALLET_ADDRESS &&
        value.value >= BtcAmount
      )
        validFlag = true;
      else
        globalErrorText =
          "The payment is higher than expected or there is no treasure address here";
    });
    return validFlag;
  } catch (error) {
    globalErrorText = error.response.data;
    console.log("checkVout error ==> ", error);
    return false;
  }
}
