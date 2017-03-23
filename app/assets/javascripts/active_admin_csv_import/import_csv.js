//= require backbone/json2
//= require backbone/underscore
//= require backbone/backbone
//= require recline/backend.csv.js
//= require recline/backend.memory.js
//= require recline/model
//= require underscore.string.min.js
//= require_self

// Mix in underscore.string.js methods into underscore.js
_.mixin(_.str.exports());


$(document).ready(function() {
  // the file input
  var $file = $('#csv-file-input')[0];

  var clearFileInput = function() {
    // Reset input so .change will be triggered if we load the same file again.
    $($file).wrap('<form>').closest('form').get(0).reset();
    $($file).unwrap();

    // Clear progress
    var progress = $("#csv-import-progress");
    progress.text("");

    // Clear validation errors
    $("#csv-import-errors").html("");
  };

  // listen for the file to be submitted
  try{
    $($file).change(function(e) {

      var progress = $("#csv-import-progress");
      progress.text("Loading...");

      // create the dataset in the usual way but specifying file attribute
      var dataset = new recline.Model.Dataset({
        file: $file.files[0],
        delimiter: import_csv_delimiter,
        backend: 'csv'
      });

      console.log("Recline Modal Dataset Executed");

      dataset.fetch().done(function(data) {
        console.log("Data fetch Done!");
        if (!data.recordCount) {
          alert("No records found. Please save as 'Windows Comma Separated' from Excel (2nd CSV option).");
          clearFileInput();
          return;
        }

        // Re-query to just one record so we can check the headers.
        dataset.query({
          size: 1
        });

        // Check whether the CSV's columns match up with our data model.
        // import_csv_fields is passed in from Rails in import_csv.html.erb
        var required_columns = import_csv_required_columns;
        var all_columns = import_csv_columns;
        var csv_columns = _.pluck(data.records.first().fields.models, "id");
        var normalised_csv_columns = _.map(csv_columns, function(name) {
          return _.underscored(name);
        });

        // Check we have all the columns we want.
        var missing_columns = _.difference(required_columns, normalised_csv_columns);
        var missing_columns_humanized = _.map(missing_columns, function(name) {
          return _.humanize(name);
        });

        if (missing_columns.length > 0) {
          alert("The following columns are missing: " + _.toSentence(missing_columns_humanized) + ". Please check your column names.");
        } else {
          // Import!
          console.log("Columns Not Missing!");
          var total = data.recordCount;
          var loaded = 0;
          var succeeded = 0;
          var i = 0;

          // Batch rows into 50s to send to the server
          // var n = 50;
          // var batchedModels = _.groupBy(data.records.models, function(a, b) {
          //   return Math.floor(b / n);
          // });

          var rowIndex = 0;

          var postRows = function(dataset, index) {
            console.log("Post Rows Started!");
            // Query the data set for the next batch of rows.
            dataset.query({
              size: 100,
              from: 100 * index
            });
            var currentBatch = data.records.models;

            var records_data = [];

            // Construct the payload for each row
            _.each(currentBatch, function(record, i) {

              // Filter only the attributes we want, and normalise column names.
              var record_data = {};
              record_data["_row"] = rowIndex;

              // Construct the resource params with underscored keys
              _.each(_.pairs(record.attributes), function(attr) {
                var underscored_name = _.underscored(attr[0]);
                if (_.contains(all_columns, underscored_name)) {

                  var value = attr[1];

                  // Prevent null values coming through as string 'null' so allow_blank works on validations.
                  if (value === null) {
                    value = '';
                  }

                  record_data[underscored_name] = value;
                }
              });

              records_data.push(record_data);
              rowIndex = rowIndex + 1;
            });

            var payload = {};
            payload[import_csv_resource_name] = records_data;

            // Send this batch to the server.
            $.post(
              import_csv_path,
              payload,
              null,
              'json')
              .always(function(xhr) {
                loaded = loaded + currentBatch.length;
                progress.text("Progress: " + loaded + " of " + total);

                // Show validation errors for any failed rows.
                $("#csv-import-errors").append(xhr.responseText);

                if (xhr.status == 200) {
                  if (loaded == total) {
                    progress.html("Done. Imported " + total + " records.");
                    if (redirect_path) {
                      progress.html(progress.text() + " <a href='" + redirect_path + "'>Click to continue.</a>");
                    }
                  } else {
                    // Send the next batch!
                    postRows(dataset, index + 1);
                  }
                } else {
                  alert("Import interrupted. The server could not be reached or encountered an error.");
                }

              });
          };
          postRows(dataset, 0);
        }

        clearFileInput();
      });
    });
  }
  catch(err){
    console.log(err.message);
  }

});
