import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ganache";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import * as dotenv from "dotenv";
import "hardhat-gas-reporter";
import "hardhat-watcher";
dotenv.config();

const accts: string[] = [<string>process.env.PRIVATE_KEY_DEV, ...(<string>process.env.TEST_KEYS).split(',')]
const config = {
  Runs: 5,
  solidity: {
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 20000000,
  },
  networks: {
    hardhat: {},
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
      accounts: accts,
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
      accounts: accts,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: [process.env.PRIVATE_KEY_MAIN],
    },
  },
  gasReporter: {
    currency: "USD",
    coinmarketcap: process.env.CMC_API_KEY,
  },
  watcher: {
    ci: {
      tasks: [
        "clean",
        { command: "compile", params: { quiet: true } },
        {
          command: "test",
          params: { noCompile: true, testFiles: ["test/testfile.ts"] },
        },
      ],
    },
  },
};
export default config;
