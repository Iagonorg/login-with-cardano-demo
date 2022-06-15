import './Login.css';

import React, { useState } from 'react';
import { Auth } from '../types';

interface Props {
	onLoggedIn: (auth: Auth) => void;
	handleSignMessage: ({
		publicAddress,
		nonce,
	}: {
		publicAddress: string;
		nonce: string;
	}) => Promise<{
		publicAddress: string;
		signature: string;
		key?: string;
	}>;
	getPublicAddress: () => Promise<string | undefined>;
	walletName: string;
}

export const Login = ({
	onLoggedIn,
	handleSignMessage,
	getPublicAddress,
	walletName,
}: Props): JSX.Element => {
	const [loading, setLoading] = useState(false); // Loading button state

	const handleAuthenticate = ({
		publicAddress,
		signature,
		key,
	}: {
		publicAddress: string;
		signature: string;
		key?: string;
	}) =>
		fetch(`${process.env.REACT_APP_BACKEND_URL}/auth`, {
			body: JSON.stringify({ publicAddress, signature, key }),
			headers: {
				'Content-Type': 'application/json',
			},
			method: 'POST',
		}).then((response) => response.json());

	const handleSignup = (publicAddress: string | undefined) => {
		const blockchain =
			walletName == 'Nami' || walletName == 'Flint'
				? 'CARDANO'
				: walletName == 'Metamask'
				? 'ETHEREUM'
				: undefined;
		fetch(`${process.env.REACT_APP_BACKEND_URL}/users`, {
			body: JSON.stringify({ publicAddress, blockchain }),
			headers: {
				'Content-Type': 'application/json',
			},
			method: 'POST',
		}).then((response) => response.json());
	};

	const handleClick = async () => {
		setLoading(true);

		const publicAddress = await getPublicAddress();
		fetch(
			`${process.env.REACT_APP_BACKEND_URL}/users?publicAddress=${publicAddress}`
		)
			.then((response) => response.json())
			.then((users) =>
				users.length ? users[0] : handleSignup(publicAddress)
			)
			.then(handleSignMessage)
			.then(handleAuthenticate)
			.then(onLoggedIn)
			.catch((err) => {
				window.alert(err);
				setLoading(false);
			});
	};

	return (
		<div>
			<button
				className={`Login-button Login-${walletName}`}
				onClick={handleClick}
			>
				{loading ? 'Loading...' : `Login with ${walletName}`}
			</button>
		</div>
	);
};
