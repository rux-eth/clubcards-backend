import { Signer } from "ethers";
import { arrayify } from "ethers/lib/utils";
import * as hre from "hardhat";

interface ClaimSigParams {
  tokenIds: Array<number>;
  amounts: Array<number>;
}
interface MintSigParams {
  numMints: number;
  editionId: number;
}
interface SigResponse {
  timestamp: number;
  signature1: string;
  signature2: string;
}
export default function createSig(
  senderAddy: string,
  params: ClaimSigParams | MintSigParams,
  nonce: number,
  signer: Signer,
  contractAddress: string,
  timestamp?: number
): Promise<SigResponse | string> {
  return new Promise((resolve, reject) => {
    let ts = timestamp || Math.round(Date.now() / 1000);
    const message: string = (<ClaimSigParams>params).tokenIds
      ? hre.ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256[]", "uint256[]", "uint256", "uint256"],
          [
            senderAddy,
            (<ClaimSigParams>params).tokenIds,
            (<ClaimSigParams>params).amounts,
            nonce,
            ts,
          ]
        )
      : hre.ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256", "uint256", "uint256", "uint256"],
          [
            senderAddy,
            (<MintSigParams>params).numMints,
            (<MintSigParams>params).editionId,
            nonce,
            ts,
          ]
        );
    let hashed = hre.ethers.utils.keccak256(message);
    signer
      .signMessage(arrayify(hashed))
      .then((sig2) => {
        let recAddress = hre.ethers.utils.recoverAddress(
          arrayify(hre.ethers.utils.hashMessage(arrayify(hashed))),
          sig2
        );
        signer.getAddress().then((address) => {
          if (recAddress == address) {
            if (senderAddy == contractAddress) {
              resolve(sig2);
            } else {
              createSig(
                contractAddress,
                params,
                nonce,
                signer,
                contractAddress,
                ts
              ).then((sig) => {
                resolve(<SigResponse>{
                  timestamp: ts,
                  signature1: sig,
                  signature2: sig2,
                });
              });
            }
          } else {
            reject(new Error(`Unable to recover address`));
          }
        });
      })
      .catch((err) => {
        reject(err);
      });
  });
}
export { ClaimSigParams, MintSigParams, SigResponse };
