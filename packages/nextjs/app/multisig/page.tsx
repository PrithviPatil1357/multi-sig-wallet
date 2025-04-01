"use client";

import { type FC } from "react";
import { TransactionEventItem } from "./_components";
import { QRCodeSVG } from "qrcode.react";
import { useAccount, useReadContract } from "wagmi";
import { Address, Balance } from "~~/components/scaffold-eth";
import { useDeployedContractInfo, useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

// ABI extracted from packages/hardhat/artifacts/contracts/MetaMultiSigWallet.sol/MetaMultiSigWallet.json
const metaMultiSigWalletABI = [
  {
    inputs: [
      { internalType: "uint256", name: "_chainId", type: "uint256" },
      { internalType: "address[]", name: "_owners", type: "address[]" },
      { internalType: "uint256", name: "_signaturesRequired", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "ECDSAInvalidSignature", type: "error" },
  {
    inputs: [{ internalType: "uint256", name: "length", type: "uint256" }],
    name: "ECDSAInvalidSignatureLength",
    type: "error",
  },
  { inputs: [{ internalType: "bytes32", name: "s", type: "bytes32" }], name: "ECDSAInvalidSignatureS", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "balance", type: "uint256" },
    ],
    name: "Deposit",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "address payable", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
      { indexed: false, internalType: "bytes", name: "data", type: "bytes" },
      { indexed: false, internalType: "uint256", name: "nonce", type: "uint256" },
      { indexed: false, internalType: "bytes32", name: "hash", type: "bytes32" },
      { indexed: false, internalType: "bytes", name: "result", type: "bytes" },
    ],
    name: "ExecuteTransaction",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "bool", name: "added", type: "bool" },
    ],
    name: "Owner",
    type: "event",
  },
  {
    inputs: [
      { internalType: "address", name: "newSigner", type: "address" },
      { internalType: "uint256", name: "newSignaturesRequired", type: "uint256" },
    ],
    name: "addSigner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "chainId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address payable", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "bytes", name: "data", type: "bytes" },
      { internalType: "bytes[]", name: "signatures", type: "bytes[]" },
    ],
    name: "executeTransaction",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_nonce", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "getTransactionHash",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "isOwner",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nonce",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "_hash", type: "bytes32" },
      { internalType: "bytes", name: "_signature", type: "bytes" },
    ],
    name: "recover",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "oldSigner", type: "address" },
      { internalType: "uint256", name: "newSignaturesRequired", type: "uint256" },
    ],
    name: "removeSigner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "signaturesRequired",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "newSignaturesRequired", type: "uint256" }],
    name: "updateSignaturesRequired",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
];

const Multisig: FC = () => {
  const { data: contractInfo } = useDeployedContractInfo("MetaMultiSigWallet");
  const { chain } = useAccount(); // Get chain info

  const contractAddress = contractInfo?.address;

  // Fetch signaturesRequired from the contract using wagmi's useReadContract
  const { data: signaturesRequired } = useReadContract({
    address: contractAddress,
    abi: metaMultiSigWalletABI,
    functionName: "signaturesRequired",
    args: [],
    chainId: chain?.id, // Pass the current chain's ID
    query: {
      enabled: !!contractAddress && !!chain?.id, // Only run query when address and chainId are available
    },
  });

  // Fetch nonce from the contract using wagmi's useReadContract
  const { data: nonce } = useReadContract({
    address: contractAddress,
    abi: metaMultiSigWalletABI,
    functionName: "nonce",
    args: [],
    chainId: chain?.id, // Pass the current chain's ID
    query: {
      enabled: !!contractAddress && !!chain?.id, // Only run query when address and chainId are available
    },
  });

  const { data: executeTransactionEvents } = useScaffoldEventHistory({
    contractName: "MetaMultiSigWallet",
    eventName: "ExecuteTransaction",
    fromBlock: 0n,
  });

  return (
    <div className="flex items-center flex-col flex-grow w-full my-20 gap-8">
      <div className="flex flex-col gap-4 items-center bg-base-100 shadow-lg shadow-secondary border-8 border-secondary rounded-xl p-6 w-full max-w-lg">
        <Balance address={contractAddress} />
        <Address address={contractAddress} />
        <div className="text-center">
          <p>
            Signatures Required:{" "}
            <strong>{signaturesRequired?.toString() ?? (contractAddress ? "Loading..." : "N/A")}</strong>
          </p>
          <p>
            Current Nonce: <strong>{nonce?.toString() ?? (contractAddress ? "Loading..." : "N/A")}</strong>
          </p>
        </div>
        <QRCodeSVG value={contractAddress || ""} size={256} />
      </div>

      <div className="flex flex-col mt-10 items-center bg-base-100 shadow-lg shadow-secondary border-8 border-secondary rounded-xl p-6 w-full max-w-3xl">
        <div className="text-xl font-bold my-2">Events:</div>
        {executeTransactionEvents?.map(txEvent => (
          <TransactionEventItem key={txEvent.args.hash} {...(txEvent.args as Required<(typeof txEvent)["args"]>)} />
        ))}
      </div>
    </div>
  );
};

export default Multisig;
