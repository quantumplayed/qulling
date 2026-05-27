export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                cyan: {
                    400: '#00f0ff',
                    950: '#083344', // customized
                },
                purple: {
                    400: '#c084fc',
                    500: '#a855f7',
                    900: '#581c87',
                }
            },
            animation: {
                'pulse-glow': 'pulse-glow 2s infinite',
                'scroll': 'scroll 20s linear infinite',
                'fade-in': 'fade-in 0.6s ease-out forwards',
                'gradient-x': 'gradient-x 3s ease infinite', // Adding new animation
            },
            keyframes: {
                'pulse-glow': {
                    '0%, 100%': { opacity: '0.5', boxShadow: '0 0 5px #00f0ff80' },
                    '50%': { opacity: '1', boxShadow: '0 0 15px #00f0ff80' },
                },
                scroll: {
                    from: { transform: 'translateX(0)' },
                    to: { transform: 'translateX(-50%)' },
                },
                'fade-in': {
                    from: { opacity: '0', transform: 'translateY(10px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                'gradient-x': {
                    '0%, 100%': {
                        'background-size': '200% 200%',
                        'background-position': 'left center'
                    },
                    '50%': {
                        'background-size': '200% 200%',
                        'background-position': 'right center'
                    },
                },
            }
        },
    },
    plugins: [],
}
