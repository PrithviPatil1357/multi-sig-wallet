"use client";

import { type FC, useMemo, useState } from "react";
import { TransactionItem } from "./_components";
import { useInterval } from "usehooks-ts";
import { Address, Hash } from "viem";
import { useChainId } from "wagmi";
import { useDeployedContractInfo, useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getPoolServerUrl } from "~~/utils/getPoolServerUrl";
import { notification } from "~~/utils/scaffold-eth";

type SignatureInfo = {
  signer: Address;
  signature: Hash;
};

type TransactionProposal = {
  hash: Hash;
  to: Address;
  value: string;
  data: Hash;
  nonce: bigint;
  proposer?: Address;
  signatures: SignatureInfo[];
};

type DisplayTransactionData = TransactionProposal & {
  chainId: number;
  address: Address;
  amount: string;
  signers: Address[];
  requiredApprovals?: bigint;
};

const Pool: FC = () => {
  const [transactions, setTransactions] = useState<DisplayTransactionData[]>([]);
  const { targetNetwork } = useTargetNetwork();
  const poolServerUrl = getPoolServerUrl(targetNetwork.id);
  const { data: contractInfo } = useDeployedContractInfo("MetaMultiSigWallet");
  const chainId = useChainId();

  const { data: nonce } = useScaffoldReadContract({
    contractName: "MetaMultiSigWallet",
    functionName: "nonce",
  });
  const { data: signaturesRequired } = useScaffoldReadContract({
    contractName: "MetaMultiSigWallet",
    functionName: "signaturesRequired",
  });

  const { data: eventsHistory } = useScaffoldEventHistory({
    contractName: "MetaMultiSigWallet",
    eventName: "ExecuteTransaction",
    fromBlock: 0n,
    watch: true,
  });

  const historyHashes = useMemo(() => eventsHistory?.map(ev => ev.args.hash) || [], [eventsHistory]);

  useInterval(() => {
    const getTransactions = async () => {
      if (!contractInfo?.address || !chainId) {
        return;
      }
      try {
        const response = await fetch(`${poolServerUrl}proposals/${contractInfo.address}/${chainId}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const proposals: { [key: string]: TransactionProposal } = await response.json();

        const newTransactions: DisplayTransactionData[] = Object.values(proposals).map(proposal => ({
          ...proposal,
          nonce: BigInt(proposal.nonce),
          chainId: chainId,
          address: contractInfo.address,
          amount: proposal.value,
          signers: proposal.signatures.map(sigInfo => sigInfo.signer),
          requiredApprovals: signaturesRequired,
        }));

        setTransactions(newTransactions);
      } catch (e) {
        notification.error("Error fetching transactions from pool");
        console.error(e);
      }
    };

    getTransactions();
  }, 5000);

  const lastExecutedNonce = useMemo(() => {
    if (!eventsHistory || eventsHistory.length === 0) {
      return -1n;
    }
    return eventsHistory.reduce((maxNonce, event) => {
      const eventNonce = event.args.nonce ? BigInt(event.args.nonce) : -1n;
      return eventNonce > maxNonce ? eventNonce : maxNonce;
    }, -1n);
  }, [eventsHistory]);

  return (
    <div className="flex flex-col flex-1 items-center my-20 gap-8">
      <div className="flex items-center flex-col flex-grow w-full max-w-2xl">
        <div className="flex flex-col items-center bg-base-100 shadow-lg shadow-secondary border-8 border-secondary rounded-xl p-6 w-full">
          <div className="text-xl font-bold">Transaction Pool</div>

          <div>Current Contract Nonce: {nonce !== undefined ? `#${nonce}` : "Loading..."}</div>
          <div>Signatures Required: {signaturesRequired !== undefined ? `${signaturesRequired}` : "Loading..."}</div>

          <div className="flex flex-col mt-8 gap-4 w-full">
            {transactions.length === 0
              ? "No pending transactions found."
              : transactions.map(tx => {
                  const completed = historyHashes.includes(tx.hash);
                  const outdated = lastExecutedNonce >= 0n && tx.nonce <= lastExecutedNonce;
                  return (
                    <TransactionItem
                      key={tx.hash}
                      tx={tx}
                      completed={completed}
                      outdated={outdated}
                      signaturesRequired={signaturesRequired}
                    />
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pool;
