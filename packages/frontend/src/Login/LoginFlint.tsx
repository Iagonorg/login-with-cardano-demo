import './Login.css';

import { Login } from './BaseLogin';
import React from 'react';

import { Auth } from '../types';

interface Props {
	onLoggedIn: (auth: Auth) => void;
}

let wallet: any | undefined = undefined;

export const LoginFlint = ({ onLoggedIn }: Props): JSX.Element => {
	const handleSignMessage = async ({
		publicAddress,
		nonce,
	}: {
		publicAddress: string;
		nonce: string;
	}) => {
		try {
			const signature = await wallet.signData(
				publicAddress,
				Buffer.from(
					`I am signing my one-time nonce: ${nonce}`
				).toString('hex')
			);

			return { publicAddress, signature };
		} catch (err) {
			throw new Error(
				'You need to sign the message to be able to log in.'
			);
		}
	};

	const getPublicAddress = async () => {
		if (!(window as any).cardano) {
			window.alert('Please install Flint wallet first.');
			return;
		}

		if (!wallet) {
			try {
				// Request account access if needed
				wallet = await (window as any).cardano.flint.enable();
			} catch (error) {
				window.alert('You need to allow Flint.');
				return;
			}
		}

		const address = await wallet.getChangeAddress();
		if (!address) {
			window.alert('Please activate Flint wallet first.');
			return;
		}

		return address;
	};

	return (
		<div>
			<Login
				onLoggedIn={onLoggedIn}
				handleSignMessage={handleSignMessage}
				getPublicAddress={getPublicAddress}
				walletName="Flint"
			/>
		</div>
	);
};
