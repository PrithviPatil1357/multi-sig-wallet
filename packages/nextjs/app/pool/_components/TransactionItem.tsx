import { type FC } from "react";
import { Address, BlockieAvatar } from "../../../components/scaffold-eth";
import { Abi, DecodeFunctionDataReturnType, Address as TAddress, decodeFunctionData, formatEther } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import {
  useDeployedContractInfo,
  useScaffoldContract,
  useScaffoldReadContract,
  useTransactor,
} from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getPoolServerUrl } from "~~/utils/getPoolServerUrl";
import { notification } from "~~/utils/scaffold-eth";

// Define the SignatureInfo type locally
type SignatureInfo = {
  signer: TAddress;
  signature: `0x${string}`; // Use `0x${string}` for Hash type consistency
};

// Define a type for the props that matches the actual data structure passed
// This mirrors DisplayTransactionData from pool/page.tsx
type PoolTransactionData = {
  hash: `0x${string}`;
  to: TAddress;
  value: string;
  data: `0x${string}`;
  nonce: bigint;
  proposer?: TAddress;
  signatures: SignatureInfo[]; // Expecting SignatureInfo array
  chainId: number;
  address: TAddress;
  amount: string;
  signers: TAddress[];
  requiredApprovals?: bigint;
};

type TransactionItemProps = {
  tx: PoolTransactionData;
  completed: boolean;
  outdated: boolean;
  signaturesRequired: bigint | undefined;
};

export const TransactionItem: FC<TransactionItemProps> = ({ tx, completed, outdated, signaturesRequired }) => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const transactor = useTransactor();
  const { targetNetwork } = useTargetNetwork();
  const poolServerUrl = getPoolServerUrl(targetNetwork.id);

  const { data: nonce } = useScaffoldReadContract({
    contractName: "MetaMultiSigWallet",
    functionName: "nonce",
  });

  const { data: metaMultiSigWallet } = useScaffoldContract({
    contractName: "MetaMultiSigWallet",
    walletClient,
  });

  const { data: contractInfo } = useDeployedContractInfo("MetaMultiSigWallet");

  const txnData =
    contractInfo?.abi && tx.data && tx.data !== "0x"
      ? decodeFunctionData({ abi: contractInfo.abi as Abi, data: tx.data })
      : ({} as DecodeFunctionDataReturnType);

  const hasSigned = tx.signers.indexOf(address as string) >= 0;
  const hasEnoughSignatures = signaturesRequired ? tx.signatures.length >= Number(signaturesRequired) : false;

  const getSortedSigList = async (allSigs: SignatureInfo[], newHash: `0x${string}`) => {
    const sigList: { signature: `0x${string}`; signer: `0x${string}` }[] = [];
    for (const sigInfo of allSigs) {
      const recoveredSigner = (await metaMultiSigWallet?.read.recover([newHash, sigInfo.signature])) as `0x${string}`;

      sigList.push({ signature: sigInfo.signature, signer: recoveredSigner });
    }

    sigList.sort((a, b) => {
      return BigInt(a.signer) > BigInt(b.signer) ? 1 : -1;
    });

    const finalSigList: `0x${string}`[] = [];
    const finalSigners: `0x${string}`[] = [];
    const usedSignatures: Record<string, boolean> = {};
    for (const sortedSigInfo of sigList) {
      if (!usedSignatures[sortedSigInfo.signature]) {
        finalSigList.push(sortedSigInfo.signature);
        finalSigners.push(sortedSigInfo.signer);
        usedSignatures[sortedSigInfo.signature] = true;
      }
    }

    return finalSigList;
  };

  return (
    <>
      <input type="checkbox" id={`label-${tx.hash}`} className="modal-toggle" />
      <div className="modal" role="dialog">
        <div className="modal-box">
          <div className="flex flex-col">
            <div className="flex gap-2">
              <div className="font-bold">Function Signature:</div>
              {txnData.functionName || "transferFunds"}
            </div>
            <div className="flex flex-col gap-2 mt-6">
              {txnData.args ? (
                <>
                  <h4 className="font-bold">Arguments</h4>
                  <div className="flex gap-4">
                    Updated signer: <Address address={String(txnData.args?.[0])} />
                  </div>
                  <div>Updated signatures required: {String(txnData.args?.[1])}</div>
                </>
              ) : (
                <>
                  <div className="flex gap-4">
                    Transfer to: <Address address={tx.to} />
                  </div>
                  <div>Amount: {formatEther(BigInt(tx.amount))} Ξ </div>
                </>
              )}
            </div>
            <div className="mt-4">
              <div className="font-bold">Sig hash</div>{" "}
              <div className="flex gap-1 mt-2">
                <BlockieAvatar size={20} address={tx.hash} /> {tx.hash.slice(0, 7)}
              </div>
            </div>
            <div className="modal-action">
              <label htmlFor={`label-${tx.hash}`} className="btn btn-sm">
                Close!
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col pb-2 border-b border-secondary last:border-b-0">
        <div className="flex gap-4 justify-between">
          <div className="font-bold"># {String(tx.nonce)}</div>
          <div className="flex gap-1 font-bold">
            <BlockieAvatar size={20} address={tx.hash} /> {tx.hash.slice(0, 7)}
          </div>

          <Address address={tx.to} />

          <div>{formatEther(BigInt(tx.amount))} Ξ</div>

          {signaturesRequired !== undefined && (
            <span>
              {tx.signatures.length}/{String(signaturesRequired)} {hasSigned ? "✅" : ""}
            </span>
          )}

          {completed ? (
            <div className="font-bold">Completed</div>
          ) : outdated ? (
            <div className="font-bold">Outdated</div>
          ) : (
            <>
              <div title={hasSigned ? "You have already Signed this transaction" : ""}>
                <button
                  className="btn btn-xs btn-primary"
                  disabled={hasSigned}
                  title={!hasEnoughSignatures ? "Not enough signers to Execute" : ""}
                  onClick={async () => {
                    try {
                      if (!walletClient || !metaMultiSigWallet) {
                        notification.error("Wallet or contract not ready.");
                        return;
                      }

                      const hashToSign = tx.hash;

                      const signature = await walletClient.signMessage({
                        message: { raw: hashToSign },
                      });

                      const signer = await metaMultiSigWallet.read.recover([hashToSign, signature]);

                      if (signer.toLowerCase() !== address?.toLowerCase()) {
                        notification.error("Recovered signer does not match connected account!");
                        return;
                      }

                      const isOwner = await metaMultiSigWallet.read.isOwner([signer]);

                      if (isOwner) {
                        const signData = {
                          address: tx.address,
                          chainId: tx.chainId,
                          hash: hashToSign,
                          signer: signer,
                          signature: signature,
                        };

                        const response = await fetch(`${poolServerUrl}sign`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(signData),
                        });

                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
                          if (response.status === 409) {
                            notification.warning(`Already signed: ${errorData.message || ""}`);
                          } else {
                            throw new Error(
                              `Failed to add signature: ${response.status} ${response.statusText} - ${errorData.message || ""}`,
                            );
                          }
                        } else {
                          notification.success("Signature added successfully!");
                        }
                      } else {
                        notification.info("Only owners can sign transactions");
                      }
                    } catch (e) {
                      notification.error("Error signing transaction");
                      console.log(e);
                    }
                  }}
                >
                  Sign
                </button>
              </div>

              <div title={!hasEnoughSignatures ? "Not enough signers to Execute" : ""}>
                <button
                  className="btn btn-xs btn-primary"
                  disabled={!hasEnoughSignatures}
                  onClick={async () => {
                    try {
                      if (!contractInfo || !metaMultiSigWallet) {
                        console.log("No contract info");
                        return;
                      }
                      const hashForExecution = (await metaMultiSigWallet.read.getTransactionHash([
                        nonce as bigint,
                        tx.to,
                        BigInt(tx.amount),
                        tx.data,
                      ])) as `0x${string}`;

                      const finalSigList = await getSortedSigList(tx.signatures, hashForExecution);

                      if (finalSigList.length < Number(signaturesRequired)) {
                        notification.error("Transaction no longer has enough valid signatures after processing.");
                        return;
                      }

                      await transactor(() =>
                        metaMultiSigWallet.write.executeTransaction([tx.to, BigInt(tx.amount), tx.data, finalSigList]),
                      );
                    } catch (e) {
                      notification.error("Error executing transaction");
                      console.log(e);
                    }
                  }}
                >
                  Exec
                </button>
              </div>
            </>
          )}

          <label htmlFor={`label-${tx.hash}`} className="btn btn-primary btn-xs">
            ...
          </label>
        </div>

        <div className="flex justify-between text-xs gap-4 mt-2">
          <div>Function name: {txnData.functionName || "transferFunds"}</div>

          <div className="flex gap-1 items-center">
            Addressed to: <Address address={txnData.args?.[0] ? String(txnData.args?.[0]) : tx.to} size="xs" />
          </div>
        </div>
      </div>
    </>
  );
};
