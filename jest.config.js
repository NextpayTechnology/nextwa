/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest/presets/default-esm',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['<rootDir>/src/**/*.test.ts'],
	testPathIgnorePatterns: ['<rootDir>/src/__tests__/e2e/', '<rootDir>/lib/'],
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
	transform: {
		'^.+\\.tsx?$': ['ts-jest', {
			useESM: true,
			tsconfig: {
				module: 'esnext', allowJs: true, esModuleInterop: true,
				target: 'es2022', skipLibCheck: true, strict: false,
			},
		}],
	},
}
