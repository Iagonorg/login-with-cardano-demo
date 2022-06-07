import { recoverPersonalSignature } from 'eth-sig-util';
import { bufferToHex } from 'ethereumjs-util';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import CardanoWasm = require('@emurgo/cardano-serialization-lib-nodejs');
import CardanoMsg = require('@emurgo/cardano-message-signing-nodejs');

import { config } from '../../config';
import { User } from '../../models/user.model';

export const create = (req: Request, res: Response, next: NextFunction) => {
	const { signature, publicAddress, key } = req.body;
	if (!signature || !publicAddress)
		return res
			.status(400)
			.send({ error: 'Request should have signature and publicAddress' });

	return (
		User.findOne({ where: { publicAddress } })
			////////////////////////////////////////////////////
			// Step 1: Get the user with the given publicAddress
			////////////////////////////////////////////////////
			.then((user: User | null) => {
				if (!user) {
					res.status(401).send({
						error: `User with publicAddress ${publicAddress} is not found in database`,
					});

					return null;
				}

				return user;
			})
			////////////////////////////////////////////////////
			// Step 2: Verify digital signature
			////////////////////////////////////////////////////
			.then((user: User | null) => {
				if (!(user instanceof User)) {
					// Should not happen, we should have already sent the response
					throw new Error(
						'User is not defined in "Verify digital signature".'
					);
				}

				const msg = `I am signing my one-time nonce: ${user.nonce}`;
				switch (user.blockchain) {
					case 'ETHEREUM': {
						const msgBufferHex = bufferToHex(
							Buffer.from(msg, 'utf8')
						);
						const address = recoverPersonalSignature({
							data: msgBufferHex,
							sig: signature,
						});

						// The signature verification is successful if the address found with
						// sigUtil.recoverPersonalSignature matches the initial publicAddress
						if (
							address.toLowerCase() ===
							publicAddress.toLowerCase()
						) {
							return user;
						} else {
							res.status(401).send({
								error: 'Signature verification failed',
							});
							return null;
						}
					}
					case 'CARDANO': {
						const baseAddr = CardanoWasm.BaseAddress.from_address(
							CardanoWasm.Address.from_bytes(
								Buffer.from(user.publicAddress, 'hex')
							)
						);
						const message = CardanoMsg.COSESign1.from_bytes(
							Buffer.from(signature, 'hex')
						);
						const payload = message.payload();
						if (
							payload &&
							Buffer.from(msg, 'utf-8').compare(payload)
						)
							throw Error('Payload is not correct.');
						const coseHeaders = message
							.headers()
							.protected()
							.deserialized_headers();
						const coseAddressBytes = coseHeaders
							.header(CardanoMsg.Label.new_text('address'))
							?.as_bytes();
						if (!coseAddressBytes)
							throw Error('no address in signature');
						const coseAddress = CardanoWasm.Address.from_bytes(
							coseAddressBytes
						);
						const cosePublicKeyBytes = coseHeaders.key_id();
						let publicKey = undefined;
						if (cosePublicKeyBytes) {
							publicKey = CardanoWasm.PublicKey.from_bytes(
								cosePublicKeyBytes
							);
						} else {
							if (!key) throw Error('no key provided');
							const coseKey = CardanoMsg.COSEKey.from_bytes(
								Buffer.from(key, 'hex')
							);
							const publicKeyBytes = coseKey
								.header(
									CardanoMsg.Label.new_int(
										CardanoMsg.Int.new_negative(
											CardanoMsg.BigNum.from_str('2')
										)
									)
								)
								?.as_bytes();
							if (!publicKeyBytes) {
								console.log(
									"Can't extract public key from provided key."
								);
								return null;
							}
							publicKey = CardanoWasm.PublicKey.from_bytes(
								publicKeyBytes
							);
						}

						const paymentKeyHash = publicKey.hash();
						const stakingKeyHash = baseAddr
							?.stake_cred()
							.to_keyhash();
						if (!stakingKeyHash || !paymentKeyHash) {
							console.log('No staking key available.');
							return null;
						}
						const reconsctructedAddress = CardanoWasm.BaseAddress.new(
							CardanoWasm.NetworkInfo.testnet().network_id(),
							CardanoWasm.StakeCredential.from_keyhash(
								paymentKeyHash
							),
							CardanoWasm.StakeCredential.from_keyhash(
								stakingKeyHash
							)
						);
						if (
							baseAddr?.to_address().to_bech32() !==
							reconsctructedAddress.to_address().to_bech32()
						) {
							console.log('Addresses are not same.');
							return null;
						}
						const ed25519Sig = CardanoWasm.Ed25519Signature.from_bytes(
							message.signature()
						);
						const data = message
							.signed_data(undefined, Buffer.from(msg, 'utf-8'))
							.to_bytes();
						if (!publicKey.verify(data, ed25519Sig)) {
							console.log('Signature failed to verify.');
							return null;
						}
						return user;
					}
					default:
						return null;
				}
			})
			////////////////////////////////////////////////////
			// Step 3: Generate a new nonce for the user
			////////////////////////////////////////////////////
			.then((user: User | null) => {
				if (!(user instanceof User)) {
					// Should not happen, we should have already sent the response

					throw new Error(
						'User is not defined in "Generate a new nonce for the user".'
					);
				}

				user.nonce = Math.floor(Math.random() * 10000);
				return user.save();
			})
			////////////////////////////////////////////////////
			// Step 4: Create JWT
			////////////////////////////////////////////////////
			.then((user: User) => {
				return new Promise<string>((resolve, reject) =>
					// https://github.com/auth0/node-jsonwebtoken
					jwt.sign(
						{
							payload: {
								id: user.id,
								publicAddress,
							},
						},
						config.secret,
						{
							algorithm: config.algorithms[0],
						},
						(err, token) => {
							if (err) {
								return reject(err);
							}
							if (!token) {
								return new Error('Empty token');
							}
							return resolve(token);
						}
					)
				);
			})
			.then((accessToken: string) => res.json({ accessToken }))
			.catch(next)
	);
};
