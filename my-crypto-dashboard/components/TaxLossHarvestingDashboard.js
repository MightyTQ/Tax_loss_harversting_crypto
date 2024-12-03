"use client"
import React, { useState, useEffect } from 'react';
import { ArrowDownIcon, ArrowUpIcon, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PortfolioChart from '@/components/PortfolioChart';

const LoginModal = ({ isOpen, onLogin }) => {
  const CLIENT_ID = "e353dee5-5b3d-4856-9b74-493be0a0a356";
  const CALLBACK_URL = "http://127.0.0.1/consumer_auth";
  const AUTH_URI = "https://www.coinbase.com/oauth/authorize";
  const SCOPES = "wallet:accounts:read,wallet:transactions:read,wallet:transactions:send";

  const handleCoinbaseLogin = () => {
    try {
      const authUrl = `${AUTH_URI}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${CALLBACK_URL}&scope=${SCOPES}`;
      const authWindow = window.open(authUrl, 'CoinbaseAuth', 'width=600,height=600');
      window.addEventListener('message', function(event) {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'COINBASE_AUTH_CALLBACK') {
          if (authWindow) authWindow.close();
          onLogin(); // Always trigger login success
        }
      }, false);

      // Poll for closed window as fallback
      const pollTimer = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(pollTimer);
          onLogin(); // Always trigger login success
        }
      }, 500);

    } catch (err) {
      console.error('Auth error:', err);
      onLogin(); // Always trigger login success even on error
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-semibold tracking-tight">
            Crypto Tax Loss Harvester
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 text-center">
          <p className="text-base text-gray-600 leading-relaxed">
            Connect your Coinbase account to start harvesting tax losses efficiently
          </p>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-gray-500 font-medium tracking-wider">
                Secure Authentication
              </span>
            </div>
          </div>
          
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 font-medium"
            onClick={handleCoinbaseLogin}
          >
            Connect with Coinbase
          </Button>
          
          <p className="px-8 text-center text-sm text-gray-600 leading-relaxed">
            By connecting, you agree to allow this application to view your Coinbase account information and perform transactions on your behalf.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const useRealtimePrices = (currencies) => {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const newPrices = {};
        for (const crypto of currencies) {
          const response = await fetch(`/api/prices/${crypto.currency}-USD/spot`);
          if (!response.ok) throw new Error(`Failed to fetch ${crypto.currency} price`);
          const data = await response.json();
          newPrices[crypto.currency] = parseFloat(data.data.amount);
        }
        setPrices(newPrices);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 2000);
    return () => clearInterval(interval);
  }, [currencies]);

  return { prices, loading, error };
};

const TaxLossHarvestingDashboard = () => {
  const [currencies, setCurrencies] = useState([]);
  const [harvestLoading, setHarvestLoading] = useState(false);
  const [harvestResult, setHarvestResult] = useState(null);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const { prices, loading: pricesLoading, error: pricesError } = useRealtimePrices(currencies);

  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const response = await fetch('/api/currencies');
        if (!response.ok) throw new Error('Failed to fetch currencies');
        const data = await response.json();
        setCurrencies(data.data);
      } catch (err) {
        setError(err.message);
      }
    };

    if (isAuthenticated) {
      fetchCurrencies();
    }
  }, [isAuthenticated]);

  const calculateLoss = (current, basis) => {
    if (basis === 0) return '0.00';
    return ((current - basis) / basis * 100).toFixed(2);
  };

  const calculateTotalValue = (price, quantity) => {
    return price * quantity;
  };

  const handleHarvest = async (currency) => {
    setHarvestLoading(true);
    try {
      const currentPrice = prices[currency];
      const originalCurrency = currencies.find(c => c.currency === currency);
      
      const response = await fetch(`/api/tax_loss/${currency}`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to harvest loss');
      
      const data = await response.json();
      
      if (data.success) {
        const harvestAmount = data.amount_sold;
        const profitLoss = harvestAmount * (currentPrice - originalCurrency.costBasis);
        const totalValue = harvestAmount * currentPrice;

        setCurrencies(prev => prev.map(c => {
          if (c.currency === currency) {
            return {
              ...c,
              quantity: Math.max(0, c.quantity - harvestAmount),
              costBasis: 0
            };
          }
          return c;
        }));

        setHarvestResult({
          currency,
          amountSold: harvestAmount,
          totalValue: totalValue,
          profitLoss: profitLoss
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setHarvestLoading(false);
    }
  };

  const handleLogin = () => {
    // Simulate authentication success
    setIsAuthenticated(true);
  };

  if (error || pricesError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Error: {error || pricesError}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <LoginModal isOpen={!isAuthenticated} onLogin={handleLogin} />
      
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <PortfolioChart />
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Crypto Tax Loss Harvesting Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {harvestResult && (
                <Alert className="mb-4">
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">Tax loss harvesting completed for {harvestResult.currency}:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Amount sold: {harvestResult.amountSold.toLocaleString()} {harvestResult.currency}</li>
                        <li>Total value: ${harvestResult.totalValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}</li>
                        <li className={harvestResult.profitLoss < 0 ? "text-red-500" : "text-green-500"}>
                          Total {harvestResult.profitLoss < 0 ? "loss" : "profit"}: ${Math.abs(harvestResult.profitLoss).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </li>
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {currencies.map((crypto) => {
                  const currentPrice = prices[crypto.currency] || 0;
                  const lossPercentage = calculateLoss(currentPrice, crypto.costBasis);
                  const isLoss = currentPrice < crypto.costBasis;
                  const isHarvested = crypto.costBasis === 0;
                  const totalValue = calculateTotalValue(currentPrice, crypto.quantity);
                  
                  return (
                    <Card key={crypto.currency} className="overflow-hidden">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-semibold text-lg">{crypto.name}</h3>
                            <p className="text-sm text-gray-500">{crypto.currency}</p>
                          </div>
                          {!isHarvested && (isLoss ? (
                            <ArrowDownIcon className="text-red-500" />
                          ) : (
                            <ArrowUpIcon className="text-green-500" />
                          ))}
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Current Price</span>
                            <div className="flex items-center">
                              {pricesLoading ? (
                                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              <span className="font-medium">
                                ${currentPrice.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Quantity</span>
                            <span className="font-medium">{crypto.quantity.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Cost Basis</span>
                            <span className="font-medium">
                              {isHarvested ? 'Harvested' : `$${crypto.costBasis.toLocaleString()}`}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">P/L</span>
                            <span className={`font-medium ${
                              isHarvested ? 'text-gray-500' : 
                              isLoss ? 'text-red-500' : 
                              'text-green-500'
                            }`}>
                              {isHarvested ? 'Harvested' : `${lossPercentage}%`}
                            </span>
                          </div>
                          <div className="border-t pt-2 mt-2">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium">Total Value</span>
                              <span className="font-medium text-blue-600">
                                ${totalValue.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <Button 
                          className="w-full mt-4"
                          variant={isLoss ? "destructive" : "secondary"}
                          disabled={!isLoss || harvestLoading || isHarvested}
                          onClick={() => handleHarvest(crypto.currency)}
                        >
                          {harvestLoading ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : isHarvested ? (
                            "Already Harvested"
                          ) : isLoss ? (
                            "Harvest Loss"
                          ) : (
                            "No Loss to Harvest"
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default TaxLossHarvestingDashboard;