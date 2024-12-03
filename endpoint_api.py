from flask import Flask, jsonify, request
import requests
from functools import lru_cache
from time import time
import threading
from flask_cors import CORS  # Add CORS support for frontend requests

# Initialize Flask app
app = Flask(__name__)
CORS(app) 
CACHE_DURATION = 2  # seconds
cache_lock = threading.Lock()
price_cache = {}

currencies = [
    {"name": "Bitcoin", "currency": "BTC", "costBasis": 118000.00, "quantity": 0.45},
    {"name": "Ethereum", "currency": "ETH", "costBasis": 4300.50, "quantity": 12.5},
    {"name": "Solana", "currency": "SOL", "costBasis": 145.20, "quantity": 250},
    {"name": "Cardano", "currency": "ADA", "costBasis": 0.85, "quantity": 10000},
]

def get_cached_price(currency_pair):
    """
    Get price from cache if available and not expired
    """
    current_time = time()
    with cache_lock:
        if currency_pair in price_cache:
            cached_data = price_cache[currency_pair]
            if current_time - cached_data['timestamp'] < CACHE_DURATION:
                return cached_data['price']
    return None

def update_price_cache(currency_pair, price):
    """
    Update the price cache with new data
    """
    with cache_lock:
        price_cache[currency_pair] = {
            'price': price,
            'timestamp': time()
        }

@app.route('/api/prices/<currency_pair>/spot')
def get_price(currency_pair):
    """
    Get the current price for a currency pair.
    Currency pair should be in format: BTC-USD, ETH-USD, etc.
    """
    try:
        cached_price = get_cached_price(currency_pair)
        if cached_price is not None:
            return jsonify({
                'data': {
                    'amount': str(cached_price)
                }
            })

        url = f"https://api.coinbase.com/v2/prices/{currency_pair}/spot"
        response = requests.get(url, timeout=5)
        
        if response.status_code != 200:
            return jsonify({
                'error': 'Failed to fetch price from Coinbase',
                'status': response.status_code
            }), response.status_code

        price_data = response.json()
        price = float(price_data['data']['amount'])
        
        # Update cache
        update_price_cache(currency_pair, price)
        
        return jsonify({
            'data': {
                'amount': str(price)
            }
        })

    except requests.exceptions.Timeout:
        return jsonify({
            'error': 'Request to Coinbase timed out',
            'status': 504
        }), 504
    except requests.exceptions.RequestException as e:
        return jsonify({
            'error': f'Failed to fetch price: {str(e)}',
            'status': 500
        }), 500
    except Exception as e:
        return jsonify({
            'error': f'Unexpected error: {str(e)}',
            'status': 500
        }), 500

@app.route('/api/prices/batch', methods=['POST'])
def get_batch_prices():
    """
    Get prices for multiple currencies at once.
    Expect POST body: {"pairs": ["BTC-USD", "ETH-USD", ...]}
    """
    try:
        currency_pairs = request.json.get('pairs', [])
        if not currency_pairs:
            return jsonify({
                'error': 'No currency pairs provided',
                'status': 400
            }), 400

        results = {}
        for pair in currency_pairs:
            # Check cache first
            cached_price = get_cached_price(pair)
            if cached_price is not None:
                results[pair] = str(cached_price)
                continue

            # If not in cache, fetch from Coinbase
            url = f"https://api.coinbase.com/v2/prices/{pair}/spot"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                price = float(response.json()['data']['amount'])
                update_price_cache(pair, price)
                results[pair] = str(price)
            else:
                results[pair] = None

        return jsonify({
            'data': results
        })

    except Exception as e:
        return jsonify({
            'error': f'Unexpected error: {str(e)}',
            'status': 500
        }), 500

@app.route('/api/currencies', methods=['GET'])
def get_currencies():
    """Get all currencies and their current data"""
    return jsonify({
        'data': currencies
    })

@app.route('/api/currencies/<currency>', methods=['PUT'])
def update_currency(currency):
    """Update currency data after harvesting"""
    try:
        data = request.json
        for curr in currencies:
            if curr['currency'] == currency:
                if 'quantity' in data:
                    curr['quantity'] = data['quantity']
                if 'costBasis' in data:
                    curr['costBasis'] = data['costBasis']
                return jsonify({
                    'success': True,
                    'data': curr
                })
        
        return jsonify({
            'error': 'Currency not found',
            'status': 404
        }), 404

    except Exception as e:
        return jsonify({
            'error': f'Failed to update currency: {str(e)}',
            'status': 500
        }), 500

def tax_loss_harvesting(currency):
    """Performs tax loss harvesting for a given currency."""
    try:
        currency_data = next((c for c in currencies if c['currency'] == currency), None)
        if not currency_data:
            raise ValueError(f"Currency {currency} not found")

        amount_to_sell = currency_data['quantity']
        
        original_cost_basis = currency_data['costBasis']
        currency_data['quantity'] = 0  # Sell entire position
        currency_data['costBasis'] = 0  # Zero out the cost basis
        
        return {
            'success': True,
            'message': f"Successfully sold {amount_to_sell} {currency}",
            'amount_sold': amount_to_sell,
            'original_cost_basis': original_cost_basis,
            'updated_currency': currency_data
        }

    except Exception as e:
        return {
            'success': False,
            'message': f"Error during tax loss harvesting: {str(e)}"
        }
        
@app.route('/api/tax_loss/<currency>', methods=['POST'])
def handle_tax_loss(currency):
    result = tax_loss_harvesting(currency)
    if result['success']:
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80, debug=True)