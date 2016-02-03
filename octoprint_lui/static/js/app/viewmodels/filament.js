/// <reference path="C:\Users\erikh\Source\Repos\OctoPrint\src\octoprint\static\js\app\client\printer.js" />
/// <reference path="temperature.js" />

$(function () {
    function FilamentViewModel(parameters) {
        var self = this;

        // The tool number for which the filament is being swapped
        self.toolNum = ko.observable(0);

        self.temperatureSubscription1 = undefined;
        self.temperatureSubscription2 = undefined;

        self.deferredTempCtrl = undefined;
        self.deferredLoadCtrl = undefined;
        self.deferredUnloadCtrl = undefined;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.temperatureState = parameters[4];

        self.selectedTemperatureProfile = ko.observable(undefined);

        self.DEFAULT_STATUS_TEXT = gettext('');
        self.UNLOADING_STATUS_TEXT = gettext('The filament is being released from the extruder. Please wait...');
        self.LOADING_STATUS_TEXT = gettext('');
        self.PREHEATING_STATUS_TEXT = gettext('The extruder is being heated. Please wait...');

        self.currentStatus = ko.observable(self.DEFAULT_STATUS_TEXT);

        // Probably these observerables are to be moved to the PrinterState viewmodel
        self.isPreheating = ko.observable(undefined);
        self.preheatingStatusPercentageStr = ko.observable(undefined);
        self.preheatingStatusCurrentTemp = ko.observable(undefined);
        self.preheatingStatusTargetTemp = ko.observable(undefined);

        // Views
        // ------------------

        self.showFilamentChangeFlyout = function (toolNum) {

            tools = self.temperatureState.tools();
            if (tools.length > 0) self.temperatureSubscription1 = tools[0].actual.subscribe(self.temperatureChanged);
            if (tools.length > 1) self.temperatureSubscription2 = tools[1].actual.subscribe(self.temperatureChanged);

            self._keepCheckingTemp();

            self.toolNum(toolNum);

            self.showUnload();

            self.flyout.showFlyout('filament')
            .always(function () {

                self.abortFilamentSwap();

                if (self.temperatureSubscription1 !== undefined)
                    self.temperatureSubscription1.dispose();

                if (self.temperatureSubscription2 !== undefined)
                    self.temperatureSubscription2.dispose();
            })
            .done(function () {

            })
            .fail(function () {

            });
            ;
        };

        self.showUnload = function () {
            filaments = self.settings.plugins_lui_filaments();
            toolNum = self.toolNum();
            targetProfile = filaments[toolNum].material;

            // Check if material is loaded, if not, move to load screen
            if (targetProfile.name == 'None')
                self.showLoad()
            else
                {
                $('.swap_process_step').removeClass('active');
                $('#swap_process_unload').addClass('active');
                $('#unload_cmd').removeClass('disabled');
            }
        };

        self.showLoad = function () {
            $('.swap_process_step').removeClass('active');
            $('#swap_process_load').addClass('active');

            self.currentStatus(self.DEFAULT_STATUS_TEXT);
        };

        self.showStopLoad = function () {
            $('.swap_process_step').removeClass('active');
            $('#swap_process_stopload').addClass('active');
        };

        // UI control
        // ------------------

        self.doUnload = function () {
            toolNum = self.toolNum();
            targetProfile = self.settings.plugins_lui_filaments()[toolNum].material;

            $('#swap_process_unload').removeClass('active');

            self.preheatForSwap(targetProfile).done(function () {
                console.log("Preheat done. Retracting filament...");

                self.unloadFilament().done(function () {

                    console.log("Filament retracted");

                    newMaterial = self.settings.temperature_profiles()[0]; // Hard-coded 'none' material
                    self.saveFilamentMaterial(newMaterial);

                    self.showLoad();

                });
            });

            // Checks if extruder is already at right temperature
            self.checkPreheatComplete();

        };

        self.doLoad = function () {
            targetProfile = self.selectedTemperatureProfile();

            if (targetProfile.name == 'None') {
                self.flyout.closeFlyoutWithButton();
                return;
            }

            $('#swap_process_load').removeClass('active');

            self.preheatForSwap(targetProfile).done(function () {
                console.log("Preheat done. Loading filament...");

                self.showStopLoad();

                self.loadFilament().fail(function () {
                    console.log('Loading time-out');
                    self.showLoad();

                    $.notify(
                        {
                            title: gettext("A time-out occured."),
                            text: gettext("Please load the filament again and press done when it is loaded.")
                        },
                        "error"
                    );

                });
            });


            // Checks if extruder is already at right temperature
            self.checkPreheatComplete();
        };

        self.doStopLoad = function () {
            self.stopLoadingFilament();

            // Stop waiting for timeout
            self.deferredLoadCtrl = undefined;

            newMaterial = self.selectedTemperatureProfile();

            self.saveFilamentMaterial(newMaterial);

            self.flyout.closeFlyoutWithButton();
        }

        self.abortFilamentSwap = function () {
            //TODO: Reset whatever there may be to reset
            self.stopLoadingFilament();
            self._resetHeating();
            self.currentStatus(self.DEFAULT_STATUS_TEXT);
        }

        // Printer control
        // ------------------

        self.preheatForSwap = function (newProfile) {
            self.deferredTempCtrl = $.Deferred();

            toolNum = self.toolNum();
            tool = self.temperatureState.tools()[toolNum];

            self.temperatureState.setTargetFromProfile(tool, newProfile);

            if (!self.temperatureState.isToolSwapReady(tool.actual(), tool.target())) {
                self.currentStatus(self.PREHEATING_STATUS_TEXT);
            }

            return self.deferredTempCtrl;
        }

        self.unloadFilament = function () {
            self.deferredUnloadCtrl = $.Deferred();

            self.currentStatus(self.UNLOADING_STATUS_TEXT);

            self._sendApi({
                command: "start_unloading",
                tool: "tool" + self.toolNum()
            });

            return self.deferredUnloadCtrl;
        }

        self.loadFilament = function () {
            self.deferredLoadCtrl = $.Deferred();

            self.currentStatus(self.LOADING_STATUS_TEXT);

            self._sendApi({
                command: "start_loading",
                tool: "tool" + self.toolNum()
            });

            return self.deferredLoadCtrl;
        }

        self.stopLoadingFilament = function () {
            self._sendApi({
                command: "stop_loading"
            });
        }

        // Events
        // ------------------

        self.unloadingStopped = function () {

            // If unloading stopped, it's a good thing, so resolve
            if (self.deferredUnloadCtrl !== undefined)
                self.deferredUnloadCtrl.resolve();
        }

        self.loadingStopped = function () {
            // If loading stopped, a timeout occured. Warn user
            if (self.deferredLoadCtrl !== undefined)
                self.deferredLoadCtrl.reject();
        }

        self.temperatureChanged = function () {
            console.log('Temp update');
            self.checkPreheatComplete();
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {

            if (plugin != "lui") {
                return;
            }

            var messageType = data.type;
            console.log("plugin sends: " + messageType);
            switch (messageType) {
                case "load_filament_start":
                    // Do nothing
                    break;
                case "loading_filament_stop":
                    self.loadingStopped();
                    break;
                case "unloading_filament_stop":
                    self.unloadingStopped();
                    break;
            }
        };

        // Helpers
        // ------------------

        self.getActiveTool = function () {
            toolNum = self.toolNum();
            return self.temperatureState.tools()[toolNum];
        }

        self.checkPreheatComplete = function () {
            tool = self.getActiveTool();

            if (self.temperatureState.isToolSwapReady(tool.actual(), tool.target())) {
                if (self.deferredTempCtrl !== undefined)
                    self.deferredTempCtrl.resolve();
                console.log('Preheat complete');
                self.isPreheating(false);
            }
            else {
                self.isPreheating(true);
            }
        }


        self.saveFilamentMaterial = function (material) {
            toolNum = self.toolNum();

            self.settings.plugins_lui_filaments()[toolNum]["material"] = material;

            var fils = self.settings.plugins_lui_filaments()[toolNum];

            self.settings.saveData();
        }

        self._keepCheckingTemp = function () {
            // If a binding update is missed for some reason, ensure the user is forwarded

            if (self.isPreheating())
                self.checkPreheatComplete();

            setTimeout(self._keepCheckingTemp, 1000);
        }

        self._resetHeating = function () {
            //TODO: Disable this function if user is 'advanced' and has pre-heating on when opening flyout
            toolNum = self.toolNum();
            tool = self.temperatureState.tools()[toolNum];
            zeroProfile = { extruder: 0, bed: 0 };

            self.temperatureState.setTargetFromProfile(tool, zeroProfile);
        }

        self._sendApi = function (data) {
            $.ajax({
                url: API_BASEURL + "plugin/lui",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data)
            });
        };

        self.fromCurrentData = function (data) {
            self._processStateData(data.state);
        };

        self.fromHistoryData = function (data) {
            self._processStateData(data.state);
        };

        self._processStateData = function (data) {

        };

    }

    OCTOPRINT_VIEWMODELS.push([
      FilamentViewModel,
      ["loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel", "temperatureViewModel"],
      ["#filament_status", "#filament_flyout"]
    ]);

});