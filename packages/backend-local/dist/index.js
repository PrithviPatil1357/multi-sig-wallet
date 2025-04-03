"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Rename the storage object and define its type
const multisigData = {};
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.urlencoded({ extended: true }));
// Update GET endpoint path and logic
app.get("/proposals/:address/:chainId", async (req, res) => {
    const { address, chainId } = req.params;
    const key = `${address}_${chainId}`;
    console.log("Get /proposals for key:", key);
    res.status(200).send(multisigData[key] || {}); // Return all proposals for this key, or empty object if none
});
// Endpoint to submit a new transaction proposal
app.post("/propose", async (req, res) => {
    const { address, // Multisig contract address
    chainId, hash, // Pre-calculated transaction hash
    to, value, data, nonce, proposer, // Address submitting the proposal
     } = req.body;
    console.log("Post /propose", req.body);
    // Basic validation
    if (!address ||
        !chainId ||
        !hash ||
        !to ||
        value === undefined ||
        data === undefined ||
        nonce === undefined) {
        console.error("Missing required fields for proposal");
        return res
            .status(400)
            .send({ error: "Missing required fields for proposal." });
    }
    const key = `${address}_${chainId}`;
    console.log("Proposal key:", key);
    // Initialize storage for this multisig if it doesn't exist
    if (!multisigData[key]) {
        multisigData[key] = {};
    }
    // Check if this proposal hash already exists for this multisig
    if (multisigData[key][hash]) {
        console.warn(`Proposal with hash ${hash} already exists for ${key}`);
        // Decide on behavior: overwrite, return error, or ignore?
        // For now, let's just return the existing proposal perhaps?
        // Or maybe return an error status?
        // Let's return 409 Conflict for now.
        return res.status(409).send({
            message: "Proposal with this hash already exists.",
            proposal: multisigData[key][hash],
        });
    }
    // Create the new proposal object
    const newProposal = {
        hash,
        to,
        value: String(value), // Ensure value is stored as string
        data,
        nonce,
        proposer,
        signatures: [], // Initialize with empty signatures
    };
    // Store the new proposal
    multisigData[key][hash] = newProposal;
    console.log("Stored new proposal:", newProposal);
    console.log("Current multisigData:", JSON.stringify(multisigData, null, 2));
    // Respond with the created proposal
    res.status(201).send(newProposal);
});
// Endpoint to add a signature to an existing proposal
app.post("/sign", async (req, res) => {
    const { address, // Multisig contract address
    chainId, hash, // Transaction hash of the proposal to sign
    signer, // Address of the signer
    signature, // The actual signature
     } = req.body;
    console.log("Post /sign", req.body);
    // Basic validation
    if (!address || !chainId || !hash || !signer || !signature) {
        console.error("Missing required fields for signing");
        return res
            .status(400)
            .send({ error: "Missing required fields for signing." });
    }
    const key = `${address}_${chainId}`;
    console.log("Signing key:", key, "hash:", hash);
    // Check if the multisig exists in our data
    if (!multisigData[key]) {
        console.error(`Multisig key ${key} not found`);
        return res
            .status(404)
            .send({ error: "Multisig contract not found in backend storage." });
    }
    // Check if the proposal exists for this multisig
    const proposal = multisigData[key][hash];
    if (!proposal) {
        console.error(`Proposal hash ${hash} not found for key ${key}`);
        return res
            .status(404)
            .send({ error: "Proposal with the given hash not found." });
    }
    // Check if this signer has already signed this proposal
    const existingSignature = proposal.signatures.find((sigInfo) => sigInfo.signer.toLowerCase() === signer.toLowerCase());
    if (existingSignature) {
        console.warn(`Signer ${signer} already signed proposal ${hash}`);
        // Potential options: update signature, return error, or just return success?
        // Let's return 409 Conflict for now.
        return res
            .status(409)
            .send({ message: "Signer has already signed this proposal.", proposal });
    }
    // Add the new signature
    const newSignatureInfo = {
        signer,
        signature,
    };
    proposal.signatures.push(newSignatureInfo);
    console.log(`Added signature from ${signer} to proposal ${hash}`);
    console.log("Updated multisigData:", JSON.stringify(multisigData, null, 2));
    // Respond with the updated proposal
    res.status(200).send(proposal);
});
const PORT = process.env.PORT || 49832;
const server = app
    .listen(PORT, () => {
    console.log("HTTP Listening on port:", server.address().port);
})
    .on("error", (error) => {
    console.error("Error occurred starting the server: ", error);
});
