// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  console.log("Deploying");
  const Con = await hre.ethers.getContractFactory("CCAuthTx");
  console.log("Got Factory");
  const con = await Con.deploy("0xE2fF341C806b5107cFcE2ddC41ec5119855B2deC");

  await con.deployed();

  console.log("ClubCards deployed to:", con.address);
  /* 
  console.log("Deploying");
  const Greeter = await hre.ethers.getContractFactory("ClubCards");
  console.log("Got Factory");
  const greeter = await Greeter.deploy(
    "0x4f65cDFfE6c48ad287f005AD14E78ff6433c8d67"
  );

  await greeter.deployed();

  console.log("ClubCards deployed to:", greeter.address);
   */
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
