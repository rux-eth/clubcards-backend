import { Listener } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { createHash } from "crypto";
import { BigNumber, Contract, Signer } from "ethers";
import { arrayify, formatEther } from "ethers/lib/utils";
import * as hre from "hardhat";
import { format } from "path/posix";
import createSig, {
  ClaimSigParams,
  MintSigParams,
  SigResponse,
} from "../scripts/util/sigs";
import LogsDecoder from "../scripts/util/logs-decoder";
import ccBuild from "../artifacts/contracts/ClubCards.sol/ClubCards.json";
import ccAuthBuild from "../artifacts/contracts/CCAuthTx.sol/CCAuthTx.json";

const logsDecoder = LogsDecoder.create();
logsDecoder.addABI(ccBuild.abi);
logsDecoder.addABI(ccAuthBuild.abi);
interface Account {
  address: string;
  ethBalance: number;
  clubCardsBalance: Map<number, number>;
}
interface MintParams {
  numMints: number;
  waveId: number;
}
interface ClaimParams {
  tokenIds: Array<number>;
  amounts: Array<number>;
}
interface Wave {
  waveId: number;
  MAX_SUPPLY: number;
  REVEAL_TIMESTAMP: number;
  price: { ether: number; wei: BigNumber };
  startIndex: number;
  startIndexBlock: number;
  status: boolean;
  whitelistStatus: boolean;
  circSupply: number;
  provHash: string;
  _waveURI: string;
}
interface Claim {
  CLAIM_INDEX: number;
  TOKEN_INDEX: number;
  status: boolean;
  supply: number;
  uri: string;
}
const waveSupplies: number = 400;
const whitelist = true;
const waveNums: number = 5;

describe("CCAuthTx", function () {
  let signers: Array<SignerWithAddress>;
  let cc: Contract;
  let ccat: Contract;
  let waves: Array<Promise<Object>> = [];
  let waveData: Array<Wave> = [];
  const getBalances: Function = async (): Promise<Account[]> => {
    return await Promise.all(
      signers.map(async (elem: SignerWithAddress) => {
        const addy = await elem.getAddress();
        return <Account>{
          address: addy,
          ethBalance:
            Math.round(
              parseFloat(formatEther(await elem.getBalance())) * 10000
            ) / 10000,
          clubCardsBalance: await getCCBalances(addy),
        };
      })
    );
  };
  const getCCBalances: Function = async (
    address: string
  ): Promise<Map<number, number>> => {
    let supply = (await cc.totalSupply()).toNumber();
    let balances: Map<number, number> = new Map();
    (
      await Promise.all(
        Array.from({ length: supply }, (_, i) => cc.balanceOf(address, i))
      )
    ).forEach((elem, i) => {
      if (elem.toNumber() > 0) {
        balances.set(i, elem.toNumber());
      }
    });
    return balances;
  };
  const authTx: Function = async (
    sender: SignerWithAddress,
    nonce: number,
    params: MintParams | ClaimParams
  ): Promise<any> => {
    if ((<MintParams>params).numMints) {
      const [numMints, waveId] = [
        (<MintParams>params).numMints,
        (<MintParams>params).waveId,
      ];
      const sigParams: MintSigParams = {
        numMints: numMints,
        editionId: waveId,
      };
      const sigRes: SigResponse = <SigResponse>(
        await createSig(
          sender.address,
          sigParams,
          nonce,
          signers[0],
          ccat.address
        )
      );
      const overrides = {
        value: parseWave(await cc.getWave(waveId)).price.wei.mul(numMints),
      };
      return ccat
        .connect(sender)
        .mint(
          numMints,
          waveId,
          nonce,
          sigRes.timestamp,
          sigRes.signature1,
          sigRes.signature2,
          overrides
        );
    } else {
      const [tokenIds, amounts] = [
        (<ClaimParams>params).tokenIds,
        (<ClaimParams>params).amounts,
      ];
      const sigParams: ClaimSigParams = {
        tokenIds: tokenIds,
        amounts: amounts,
      };
      const sigRes: SigResponse = <SigResponse>(
        await createSig(
          sender.address,
          sigParams,
          nonce,
          signers[0],
          ccat.address
        )
      );
      return ccat
        .connect(sender)
        .claim(
          tokenIds,
          amounts,
          nonce,
          sigRes.timestamp,
          sigRes.signature1,
          sigRes.signature2
        );
    }
  };
  beforeEach(async () => {
    try {
      signers = await hre.ethers.getSigners();
      const ClubCards = await hre.ethers.getContractFactory(
        "ClubCards",
        signers[0]
      );
      cc = await ClubCards.deploy("0x4f65cDFfE6c48ad287f005AD14E78ff6433c8d67");
      await cc.deployed();
      const CCAuthTx = await hre.ethers.getContractFactory(
        "CCAuthTx",
        signers[0]
      );
      ccat = await CCAuthTx.deploy(cc.address);
      await ccat.deployed();
      for (let i = 3; i < waveNums + 3; i++) {
        let wave: Wave = constructWave(
          i,
          86400,
          0.01 * (3 + getRandInt(7)),
          true,
          whitelist
        );
        //console.log(`Wave ${i}:`);
        //console.log(wave);
        waveData.push(wave);
        waves.push(
          cc.setWave(
            i,
            wave.MAX_SUPPLY,
            wave.REVEAL_TIMESTAMP,
            wave.price.wei,
            wave.status,
            wave.whitelistStatus,
            wave.provHash,
            wave._waveURI
          )
        );
      }

      await Promise.all(waves);
      await cc.setAdmin(signers[0].address);
      await cc.setAllStatus(true);
    } catch (e) {
      console.error(e);
    }
  });
  it("CCAuthTx: Mints", async () => {
    try {
      let accounts: Array<Account> = await getBalances();
      let nonces: Map<string, number> = new Map();
      let mints: Array<Promise<any>> = [];
      await Promise.all(
        waveData.map((wave) => cc.setWaveWLStatus(wave.waveId, true))
      );
      for (let i = 0; i < 30; i++) {
        const signerId = getRandInt(signers.length);
        const randSigner = signers[signerId];
        const authTxNonce = nonces.get(randSigner.address) || 0;
        const authParams: MintParams = {
          numMints: 10,
          waveId: 3 + getRandInt(waveNums),
        };
        mints.push(authTx(randSigner, authTxNonce, authParams));
        nonces.set(randSigner.address, authTxNonce + 1);
      }
      let txs = await Promise.all(mints);
      let txRec = await hre.ethers.provider.getTransactionReceipt(txs[0].hash);
      let res = logsDecoder.decodeLogs(txRec.logs);
      console.log(res[2]);
    } catch (e) {
      console.error(e);
    }
  });
  it("CCAuthTx: Claims", async () => {
    try {
      let nonces: Map<string, number> = new Map();
      let claims: Array<Promise<any>> = [];

      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          cc.setClaim(i, `www.cc.claims/${i}/`, true)
        )
      );
      for (let i = 0; i < 20; i++) {
        const signerId = getRandInt(signers.length);
        const randSigner = signers[signerId];
        const authTxNonce = nonces.get(randSigner.address) || 0;
        const authParams: ClaimParams = {
          tokenIds: [1],
          amounts: [1],
        };
        claims.push(authTx(randSigner, authTxNonce, authParams));
        nonces.set(randSigner.address, authTxNonce + 1);
      }
      await Promise.all(claims);
    } catch (e) {
      console.error(e);
    }
  });
});
describe("ClubCards", () => {
  let admin: SignerWithAddress;
  let cc: Contract;
  let ccat: Contract;
  let waves: Array<Promise<Object>> = [];
  let waveData: Array<any> = [];
  beforeEach(async () => {
    admin = (await hre.ethers.getSigners())[0];
    const ClubCards = await hre.ethers.getContractFactory("ClubCards");
    cc = await ClubCards.deploy("0x4f65cDFfE6c48ad287f005AD14E78ff6433c8d67");
    const CCAuthTx = await hre.ethers.getContractFactory("CCAuthTx");
    ccat = await CCAuthTx.deploy(cc.address);
    await cc.setAdmin(admin.address);
    await cc.setAllStatus(true);
    for (let i = 3; i < waveNums + 3; i++) {
      let wave: any = constructWave(
        i,
        86400,
        0.01 * (3 + getRandInt(7)),
        true,
        whitelist
      );
      console.log(`Wave ${i}:`);
      console.log(wave);
      waveData.push(wave);
      waves.push(
        cc.setWave(
          i,
          wave.MAX_SUPPLY,
          wave.REVEAL_TIMESTAMP,
          wave.price.wei,
          wave.status,
          wave.whitelistStatus,
          wave.provHash,
          wave._waveURI
        )
      );
    }
  });
  it("Stress Test", async () => {
    const start = Date.now();
    let counter: number = 0;
    let tracker: any = {};
    tracker["Ids"] = [];
    tracker["Claimable"] = [];
    tracker["WaveIds"] = [];
    tracker["Amounts"] = [];
    tracker["ClaimIds"] = [];
    tracker["Gas"] = {};
    tracker["Gas"]["Claims"] = {};
    tracker["Gas"]["WLMints"] = {};
    for (let i = 1; i < 11; i++) {
      tracker["Gas"][i.toString()] = [];
      tracker["Gas"]["Claims"][i.toString()] = [];
      tracker["Gas"]["WLMints"][i.toString()] = [];
    }
    let claimNums = 1;
    let filled: Array<number> = [];
    let ti = 0;
    const claimTxBuilder = (
      numClaims: number,
      tokenIdsOfClaims: Array<BigNumber>,
      claimNonce: number
    ) => {
      let claimArgs: Array<any> = [];
      claimArgs[2] = claimNonce;
      let claimedIds: Array<number> = [];
      claimArgs[0] = [];
      claimArgs[1] = [];

      while (numClaims > 0) {
        let claimId: number;
        do {
          claimId = getRandInt(tokenIdsOfClaims.length);
        } while (claimedIds.includes(claimId));
        claimedIds.push(claimId);
        claimArgs[0].push(tokenIdsOfClaims[claimId].toNumber());
        claimArgs[1].push(2 + getRandInt(4));
        numClaims--;
      }

      return claimArgs;
    };
    const addId = (numMints: number, waveId?: number, gas?: number) => {
      for (let i = 0; i < numMints; i++) {
        tracker.Ids.push(ti);

        if (waveId === undefined) {
          tracker.Amounts.push(0);
          tracker.Claimable.push(true);
          tracker.WaveIds.push(undefined);
          tracker.ClaimIds.push(claimNums);
          claimNums++;
        } else {
          tracker.Amounts.push(1);
          tracker.Claimable.push(false);
          tracker.WaveIds.push(waveId);
          tracker.ClaimIds.push(undefined);
          if (!(gas === undefined)) {
            tracker.Gas[numMints.toString()].push(gas);
          }
        }
        ti++;
      }
    };
    const increaseSupply = (
      tokenIds: Array<number>,
      amounts: Array<number>
    ) => {
      if (tokenIds.length != amounts.length) {
        throw Error("invlaid lengths");
      }
      for (let i = 0; i < tokenIds.length; i++) {
        tracker.Amounts[tokenIds[i]] += amounts[i];
      }
    };
    try {
      await Promise.all(waves);
      let wave = await cc.getWave(4);
      console.log(wave);

      await cc.setAllStatus(true);
      await cc.setClaim(claimNums, " ", true);
      addId(1);
      for (let i = 3; i < waves.length + 3; i++) {
        if (i % 3 === 0) {
          await cc.manualSetBlock(i);
        }
      }

      while (true) {
        if (filled.length == waves.length) {
          console.log("Finished");
          let results: Array<number> = [];
          Object.keys(tracker.Gas).forEach((key) => {
            if (!isNaN(parseInt(key))) {
              let arr = tracker.Gas[parseInt(key)];
              let result =
                arr.reduce((a: number, b: number) => a + b) / arr.length;
              results.push(result);
            }
          });
          Object.keys(tracker.Gas).forEach((key) => {
            if (!isNaN(parseInt(key))) {
              let arr = tracker.Gas[parseInt(key)];
              console.log(arr[arr.length - 1]);
            }
          });
          console.log("Average of all mints:");
          results.forEach((elem) => {
            console.log(elem);
          });
          results = [];
          Object.keys(tracker.Gas.Claims).forEach((key) => {
            let arr = tracker.Gas.Claims[key];
            let result =
              arr.reduce((a: number, b: number) => a + b) / arr.length;
            results.push(result);
          });
          Object.keys(tracker.Gas.Claims).forEach((key) => {
            let arr = tracker.Gas.Claims[key];
            console.log(arr[arr.length - 1]);
          });
          console.log("Average of all Claims:");
          results.forEach((elem) => {
            console.log(elem);
          });
          break;
        }
        const randWaveNum: number = getRandInt(waves.length) + 3;

        if (getRandInt(5) == 0) {
          await cc.setClaim(
            claimNums,
            `http://www.api-clubcards.io/claims/${claimNums}/`,
            true
          );
          addId(1);
        }
        if (getRandInt(4) == 0 && claimNums > 1) {
          let tokenIdsOfClaims: Array<BigNumber> = [];
          for (let i = 1; i < claimNums; i++) {
            let claim = await cc.getClaim(i);
            tokenIdsOfClaims.push(claim[1]);
          }
          let claimNonce = await cc.authTxNonce(
            "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
          );
          let claimArgs = claimTxBuilder(
            tokenIdsOfClaims.length > 10
              ? 1 + getRandInt(10)
              : 1 + getRandInt(tokenIdsOfClaims.length),
            tokenIdsOfClaims,
            claimNonce.toNumber()
          );
          createClaimSig(
            claimArgs[0],
            claimArgs[1],
            claimNonce,
            admin.address,
            admin,
            admin.address,
            async (res: any) => {
              claimArgs[4] = res.signature;
              claimArgs[3] = res.timestamp;
              let claimTx = await cc.claim(
                claimArgs[0],
                claimArgs[1],
                claimArgs[2],
                claimArgs[3],
                claimArgs[4]
              );
              let txRec = await hre.ethers.provider.getTransactionReceipt(
                claimTx.hash
              );
              let gasUsed = txRec.gasUsed.toNumber();
              tracker.Gas.Claims[claimArgs[0].length.toString()].push(gasUsed);
              increaseSupply(claimArgs[0], claimArgs[1]);
            }
          );
        }
        if (filled.includes(randWaveNum)) {
          continue;
        } else {
          let wave = parseWave(await cc.getWave(randWaveNum));
          let mintsLeft = wave.MAX_SUPPLY - wave.circSupply;
          if (mintsLeft === 0) {
            filled.push(randWaveNum);
            continue;
          }
          const numMints = mintsLeft <= 10 ? mintsLeft : 1 + getRandInt(10);
          if (getRandInt(11) === 0 && whitelist) {
            await cc.setWaveWLStatus(randWaveNum, true);
            const res = await createMintSig(
              admin.address,
              numMints,
              randWaveNum,
              0,
              admin,
              admin.address
            );
            let mintTx = await cc.whitelistMint(
              res.numMints,
              res.waveId,
              0,
              res.timestamp,
              res.signature,
              getOverrides(numMints, wave.price.wei)
            );
            let txRec = await hre.ethers.provider.getTransactionReceipt(
              mintTx.hash
            );
            addId(numMints, randWaveNum);
          } else {
            await cc.setWaveWLStatus(randWaveNum, false);
            let mintTx = await cc.mintCard(
              numMints,
              randWaveNum,
              getOverrides(numMints, wave.price.wei)
            );
            let txRec = await hre.ethers.provider.getTransactionReceipt(
              mintTx.hash
            );
            let gasUsed = txRec.gasUsed.toNumber();
            addId(numMints, randWaveNum, gasUsed);
          }
        }
        counter++;
        if ((counter + 100) % 100 === 0) {
          await cc.withdraw();
          console.log(counter);
        }
      }
    } catch (e) {
      console.error(e);
    }
  });
  // it("Stress Test", async () => {});
});

const parseClaim = (claimData: any): Claim => {
  return <Claim>{
    CLAIM_INDEX: claimData[0].toNumber(),
    TOKEN_INDEX: claimData[1].toNumber(),
    status: claimData[2],
    supply: claimData[3].toNumber(),
    uri: claimData[4],
  };
};
const constructWave = (
  num: number,
  timeout: number,
  price: number,
  status: boolean,
  whitelistStatus: boolean
): Wave => {
  let priceStr = price.toString();
  return {
    waveId: num,
    MAX_SUPPLY: waveSupplies + getRandInt(100),
    REVEAL_TIMESTAMP: Math.ceil(Date.now() / 1000) + timeout,
    price: { ether: price, wei: hre.ethers.utils.parseEther(priceStr) },
    startIndex: 0,
    startIndexBlock: 0,
    status: status,
    whitelistStatus: whitelistStatus,
    circSupply: 0,
    provHash: getRandomHash(),
    _waveURI: `http://www.api-clubcards.io/waves/${num}/`,
  };
};
const getRandInt = (max: number) => {
  return Math.floor(Math.random() * max);
};
const getRandomHash = () => {
  const randint = getRandInt(9999);
  return createHash("sha256").update(randint.toString()).digest("hex");
};
const parseWave = (rawWaveData: Array<any>): Wave => {
  return <Wave>(<unknown>{
    waveId: rawWaveData[0].toNumber(),
    MAX_SUPPLY: rawWaveData[1].toNumber(),
    REVEAL_TIMESTAMP: rawWaveData[2].toNumber(),
    price: {
      ether: parseFloat(formatEther(rawWaveData[3])),
      wei: rawWaveData[3],
    },
    startIndex: rawWaveData[4].toNumber(),
    startIndexBlock: rawWaveData[5].toNumber(),
    status: rawWaveData[6],
    whitelistStatus: rawWaveData[7],
    circSupply: rawWaveData[8],
    provHash: rawWaveData[9],
    _waveURI: rawWaveData[10],
  });
};
const getOverrides = (numMints: number, wavePrice: BigNumber) => {
  let price = wavePrice.mul(numMints);
  return {
    value: price,
  };
};
// create signed message
function createClaimSig(
  ids: Array<number>,
  amts: Array<number>,
  claims: number,
  sender: string,
  signer: Signer,
  signerAddy: string,
  callback: Function
) {
  let ts = Math.round(Date.now() / 1000);
  const message = hre.ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256[]", "uint256[]", "uint256", "uint256"],
    [sender, ids, amts, claims, ts]
  );
  let hashed = hre.ethers.utils.keccak256(message);
  return signer
    .signMessage(arrayify(hashed))
    .then((sig) => {
      let recAddress = hre.ethers.utils.recoverAddress(
        arrayify(hre.ethers.utils.hashMessage(arrayify(hashed))),
        sig
      );
      if (recAddress == signerAddy.toString()) {
        callback({
          tokens: ids,
          amounts: amts,
          claimNum: claims,
          signature: sig,
          recAddy: recAddress,
          timestamp: ts,
        });
      } else {
        throw new Error("COULDNT RECOVER ADDRESS FROM SIGNATURE");
      }
    })
    .catch((err) => {
      return err;
    });
}
function createMintSig(
  sender: string,
  numMints: number,
  waveId: number,
  nonce: number,
  signer: Signer,
  signerAddy: string
) {
  let ts = Math.round(Date.now() / 1000);
  const message = hre.ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256", "uint256", "uint256", "uint256"],
    [sender, numMints, waveId, nonce, ts]
  );
  let hashed = hre.ethers.utils.keccak256(message);
  return signer
    .signMessage(arrayify(hashed))
    .then((sig) => {
      let recAddress = hre.ethers.utils.recoverAddress(
        arrayify(hre.ethers.utils.hashMessage(arrayify(hashed))),
        sig
      );
      if (recAddress == signerAddy.toString()) {
        return {
          sender: sender,
          numMints: numMints,
          waveId: waveId,
          nonce: nonce,
          timestamp: ts,
          signature: sig,
        };
      } else {
        throw new Error("COULDNT RECOVER ADDRESS FROM SIGNATURE");
      }
    })
    .catch((err) => {
      return err;
    });
}
